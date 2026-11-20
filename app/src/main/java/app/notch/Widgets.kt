package app.notch

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.LocalDate

// ---------- Couleurs Notch ----------
private object NC {
    fun c(day: Long, night: Long = day) = ColorProvider(day = Color(day), night = Color(night))
    val blue = c(0xFF2F5FE8, 0xFF4C7DFF)
    val white = c(0xFFFFFFFF)
    val white80 = c(0xCCFFFFFF)
    val white35 = c(0x59FFFFFF)
    val white15 = c(0x26FFFFFF)
    val amber = c(0xFFF2B94B)
    val black = c(0xFF0A0B0D)
    val surface = c(0xFFFFFFFF, 0xFF15171B)
    val ink = c(0xFF0B0C0E, 0xFFF4F5F6)
    val muted = c(0xFF5F636C, 0xFF8C9099)
    val accent = c(0xFF2F5FE8, 0xFF4C7DFF)
    val okBg = c(0xFFDDF3E8, 0xFF123526)
    val ok = c(0xFF12804F, 0xFF3DD68C)
    val warnBg = c(0xFFFBEED3, 0xFF3A2C12)
    val warn = c(0xFF8A5A00, 0xFFF2B94B)
    val softBg = c(0xFFEEF0F3, 0xFF23262C)
    val accentBg = c(0xFFE6EDFD, 0xFF1C2540)
}

// ---------- Données envoyées par l'appli ----------
object WidgetStore {
    private const val PREFS = "notch_widgets"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    fun save(c: Context, json: String) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("data", json).apply()
        scope.launch {
            runCatching { NextSessionWidget().updateAll(c) }
            runCatching { CoachWidget().updateAll(c) }
            runCatching { MusclesWidget().updateAll(c) }
        }
    }

    fun load(c: Context): JSONObject? {
        val s = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("data", null) ?: return null
        return runCatching { JSONObject(s) }.getOrNull()
    }
}

private val DAY_NAMES = listOf("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")

data class PlanDay(val id: String, val wd: Int, val title: String, val tag: String, val ex: Int, val mins: Int, val first: String, val tab: String)

data class NextInfo(
    val label: String,
    val title: String,
    val sub: String,
    val dayId: String,
    val button: String?,
    val dots: List<Int>,   // 0 repos · 1 prévu · 2 fait · 3 ratée
    val todayIndex: Int,
    val count: Int,
    val tab: String = "",
)

/** Calcule la séance à afficher pour aujourd'hui, même si l'appli n'a pas été ouverte depuis. */
fun computeNext(o: JSONObject): NextInfo? {
    val arr = o.optJSONArray("plan") ?: return null
    val today = LocalDate.now()
    val wd = today.dayOfWeek.value
    val monday = today.minusDays((wd - 1).toLong())
    // Séances décalées cette semaine (conflit d'agenda) : seulement pour la semaine concernée
    val moves = o.optJSONObject("moves")?.takeIf { it.optString("monday") == monday.toString() }?.optJSONObject("days")
    val plan = (0 until arr.length()).map {
        val p = arr.getJSONObject(it)
        val id = p.getString("id")
        val w = moves?.optInt(id, 0)?.takeIf { d -> d in 1..7 } ?: p.getInt("wd")
        PlanDay(id, w, p.getString("title"), p.optString("tag"), p.optInt("ex"), p.optInt("mins"), p.optString("first"), p.optString("tab"))
    }.sortedBy { it.wd }
    if (plan.isEmpty()) return null
    val doneArr = o.optJSONArray("done")
    data class Done(val date: LocalDate, val day: String, val finished: Boolean)
    val done = if (doneArr == null) emptyList() else (0 until doneArr.length()).mapNotNull {
        val d = doneArr.getJSONObject(it)
        runCatching { Done(LocalDate.parse(d.getString("date")), d.getString("day"), d.optBoolean("finished")) }.getOrNull()
    }
    val weekDone = done.filter { !it.date.isBefore(monday) }.map { it.day }.toSet()
    val finishedToday = done.filter { it.date == today && it.finished }.map { it.day }.toSet()

    val active = o.optJSONObject("active")
    val activeDay = active?.optString("day")
    val activePlan = if (active != null && active.optString("date") == today.toString()) plan.firstOrNull { it.id == activeDay } else null

    val target: PlanDay
    val label: String
    val button: String?
    val todays = plan.firstOrNull { it.wd == wd }
    // Séances prévues plus tôt dans la semaine et pas faites
    val missed = plan.filter { it.wd < wd && it.id !in weekDone }
    if (activePlan != null && activePlan.id !in finishedToday) {
        target = activePlan; label = "Séance en cours"; button = "Reprendre"
    } else if (todays != null && todays.id !in finishedToday) {
        target = todays
        val m = missed.lastOrNull()
        label = if (m != null) "Aujourd’hui · ${m.title} ratée" else "Aujourd’hui"
        button = "Commencer"
    } else if (todays == null && missed.isNotEmpty()) {
        target = missed.last(); label = "Rattrapage · prévue " + DAY_NAMES[target.wd - 1]; button = "Rattraper"
    } else {
        val next = plan.firstOrNull { it.wd > wd } ?: plan.first()
        target = next
        label = (if (finishedToday.isNotEmpty()) "Bien joué · " else "") + "Prochaine : " + DAY_NAMES[next.wd - 1]
        button = null
    }
    val dots = (1..7).map { i ->
        val p = plan.firstOrNull { it.wd == i }
        when {
            p == null -> 0
            p.id in weekDone -> 2
            p.wd < wd -> 3
            else -> 1
        }
    }
    return NextInfo(
        label = label,
        title = target.title,
        sub = "${target.ex} exercices · ${target.mins} min · ${target.first.lowercase()} en premier",
        dayId = target.id,
        button = button,
        dots = dots,
        todayIndex = wd - 1,
        count = weekDone.size,
        tab = target.tab,
    )
}

// ---------- Widget « Prochaine séance » ----------
class NextSessionWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val info = WidgetStore.load(context)?.let { runCatching { computeNext(it) }.getOrNull() }
        provideContent { NextContent(context, info) }
    }
}

class NextSessionWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = NextSessionWidget()
}

@Composable
private fun NextContent(context: Context, info: NextInfo?) {
    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .cornerRadius(24.dp)
            .background(NC.blue)
            .clickable(actionStartActivity(MainActivity.intentFor(context, "view:accueil")))
            .padding(16.dp),
    ) {
        if (info == null) {
            Column(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
                Text("NOTCH", style = TextStyle(color = NC.white80, fontSize = 11.sp, fontWeight = FontWeight.Bold))
                Spacer(GlanceModifier.height(4.dp))
                Text("Ouvre Notch une première fois", style = TextStyle(color = NC.white, fontSize = 16.sp, fontWeight = FontWeight.Bold))
            }
            return@Box
        }
        Column(modifier = GlanceModifier.fillMaxSize()) {
            Text(info.label.uppercase(), style = TextStyle(color = NC.white80, fontSize = 11.sp, fontWeight = FontWeight.Bold), maxLines = 1)
            Spacer(GlanceModifier.height(2.dp))
            Text(info.title.uppercase(), style = TextStyle(color = NC.white, fontSize = 20.sp, fontWeight = FontWeight.Bold), maxLines = 1)
            Text(info.sub, style = TextStyle(color = NC.white80, fontSize = 12.sp), maxLines = 1)
            Spacer(GlanceModifier.defaultWeight())
            Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                info.dots.forEachIndexed { i, state ->
                    val color = when (state) { 2 -> NC.white; 3 -> NC.amber; 1 -> NC.white35; else -> NC.white15 }
                    Box(
                        modifier = GlanceModifier
                            .size(width = 10.dp, height = if (i == info.todayIndex) 18.dp else 10.dp)
                            .cornerRadius(5.dp)
                            .background(color),
                    ) {}
                    Spacer(GlanceModifier.width(4.dp))
                }
                Spacer(GlanceModifier.width(4.dp))
                Text("${info.count}/4", style = TextStyle(color = NC.white, fontSize = 13.sp, fontWeight = FontWeight.Bold))
                Spacer(GlanceModifier.defaultWeight())
                if (info.button != null) {
                    Box(
                        modifier = GlanceModifier
                            .cornerRadius(14.dp)
                            .background(NC.black)
                            .clickable(actionStartActivity(MainActivity.intentFor(context, "start:${info.dayId}")))
                            .padding(horizontal = 14.dp, vertical = 9.dp),
                    ) {
                        Text(info.button.uppercase() + "  →", style = TextStyle(color = NC.white, fontSize = 13.sp, fontWeight = FontWeight.Bold))
                    }
                }
            }
        }
    }
}

// ---------- Widget « Le coach » ----------
class CoachWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val coach = WidgetStore.load(context)?.optJSONObject("coach")
        val more = WidgetStore.load(context)?.optInt("more") ?: 0
        provideContent { CoachContent(context, coach, more) }
    }
}

class CoachWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = CoachWidget()
}

@Composable
private fun CoachContent(context: Context, coach: JSONObject?, more: Int) {
    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .cornerRadius(24.dp)
            .background(NC.surface)
            .clickable(actionStartActivity(MainActivity.intentFor(context, "view:progres")))
            .padding(16.dp),
    ) {
        Column(modifier = GlanceModifier.fillMaxSize()) {
            Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("LE COACH", style = TextStyle(color = NC.muted, fontSize = 11.sp, fontWeight = FontWeight.Bold))
                Spacer(GlanceModifier.defaultWeight())
                if (coach != null) {
                    val (bg, fg) = when (coach.optString("type")) {
                        "monte" -> NC.okBg to NC.ok
                        "stagne" -> NC.warnBg to NC.warn
                        "depart" -> NC.accentBg to NC.accent
                        else -> NC.softBg to NC.muted
                    }
                    Box(modifier = GlanceModifier.cornerRadius(10.dp).background(bg).padding(horizontal = 8.dp, vertical = 3.dp)) {
                        Text(coach.optString("label").uppercase(), style = TextStyle(color = fg, fontSize = 10.sp, fontWeight = FontWeight.Bold))
                    }
                }
            }
            Spacer(GlanceModifier.height(6.dp))
            if (coach == null) {
                Text("Ouvre Notch une première fois", style = TextStyle(color = NC.ink, fontSize = 15.sp, fontWeight = FontWeight.Bold))
            } else {
                Text(coach.optString("ex"), style = TextStyle(color = NC.ink, fontSize = 16.sp, fontWeight = FontWeight.Bold), maxLines = 1)
                Spacer(GlanceModifier.height(2.dp))
                Text(coach.optString("text"), style = TextStyle(color = NC.ink, fontSize = 13.sp), maxLines = 3)
                if (more > 0) {
                    Spacer(GlanceModifier.defaultWeight())
                    Text("+ $more autre${if (more > 1) "s" else ""} conseil${if (more > 1) "s" else ""}", style = TextStyle(color = NC.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold))
                }
            }
        }
    }
}

// ---------- Widget « Muscles de la semaine » ----------
/** Dessine la silhouette (même dessin que dans l'appli) colorée selon le travail de la semaine. */
object BodyRender {
    fun render(c: Context, body: JSONObject, lv: JSONObject?, widthPx: Int): android.graphics.Bitmap {
        val night = (c.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
            android.content.res.Configuration.UI_MODE_NIGHT_YES
        val colBody = if (night) 0xFF1F2229.toInt() else 0xFFE1E4EA.toInt()
        val colMuscle = if (night) 0xFF343944.toInt() else 0xFFCDD2DA.toInt()
        val colAccent = if (night) 0xFF4C7DFF.toInt() else 0xFF2F5FE8.toInt()
        val colLine = if (night) 0xFF15171B.toInt() else 0xFFFFFFFF.toInt()

        val scale = widthPx / 220f
        val bmp = android.graphics.Bitmap.createBitmap(widthPx, (218 * scale).toInt(), android.graphics.Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(bmp)
        canvas.scale(scale, scale)
        val fill = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { style = android.graphics.Paint.Style.FILL }
        val stroke = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            style = android.graphics.Paint.Style.STROKE; strokeWidth = 0.6f; color = colLine; strokeJoin = android.graphics.Paint.Join.ROUND
        }
        val outline = androidx.core.graphics.PathParser.createPathFromPathData(body.getString("outline"))

        fun both(path: android.graphics.Path, mirror: Boolean, paints: List<android.graphics.Paint>) {
            paints.forEach { canvas.drawPath(path, it) }
            if (mirror) {
                canvas.save(); canvas.translate(100f, 0f); canvas.scale(-1f, 1f)
                paints.forEach { canvas.drawPath(path, it) }
                canvas.restore()
            }
        }

        fun figure(key: String, dx: Float) {
            val list = body.optJSONArray(key) ?: return
            canvas.save(); canvas.translate(dx, 0f)
            fill.color = colBody
            both(outline, true, listOf(fill))
            for (i in 0 until list.length()) {
                val m = list.getJSONObject(i)
                val path = runCatching { androidx.core.graphics.PathParser.createPathFromPathData(m.getString("d")) }.getOrNull() ?: continue
                val level = lv?.optDouble(m.getString("g"), 0.0) ?: 0.0
                val mirror = m.optInt("s") == 1
                val base = android.graphics.Paint(fill).apply { color = colMuscle }
                val paints = mutableListOf(base)
                if (level > 0) {
                    val alpha = ((0.18 + 0.82 * level).coerceIn(0.0, 1.0) * 255).toInt()
                    paints += android.graphics.Paint(fill).apply { color = (colAccent and 0x00FFFFFF) or (alpha shl 24) }
                }
                paints += stroke
                both(path, mirror, paints)
            }
            canvas.restore()
        }
        figure("front", 0f)
        figure("back", 120f)
        return bmp
    }
}

class MusclesWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val data = WidgetStore.load(context)
        val today = LocalDate.now()
        val monday = today.minusDays((today.dayOfWeek.value - 1).toLong()).toString()
        val heat = data?.optJSONObject("heat")
        val thisWeek = heat != null && heat.optString("week") == monday && heat.optBoolean("any")
        val body = data?.optJSONObject("body")
        val bmp = body?.let { runCatching { BodyRender.render(context, it, if (thisWeek) heat!!.optJSONObject("lv") else null, 440) }.getOrNull() }
        val weak = if (thisWeek) heat!!.optString("weak").takeIf { it.isNotBlank() && it != "null" } else null
        val count = data?.let { runCatching { computeNext(it)?.count }.getOrNull() } ?: 0
        provideContent { MusclesContent(context, bmp, weak, count, data != null) }
    }
}

class MusclesWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = MusclesWidget()
}

@Composable
private fun MusclesContent(context: Context, bmp: android.graphics.Bitmap?, weak: String?, count: Int, ready: Boolean) {
    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .cornerRadius(24.dp)
            .background(NC.surface)
            .clickable(actionStartActivity(MainActivity.intentFor(context, "view:accueil")))
            .padding(12.dp),
    ) {
        Row(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
            if (bmp != null) {
                androidx.glance.Image(
                    provider = androidx.glance.ImageProvider(bmp),
                    contentDescription = "Muscles travaillés cette semaine",
                    contentScale = androidx.glance.layout.ContentScale.Fit,
                    modifier = GlanceModifier.width(130.dp).fillMaxHeight(),
                )
                Spacer(GlanceModifier.width(10.dp))
            }
            Column(modifier = GlanceModifier.defaultWeight()) {
                Text("MUSCLES DE LA SEMAINE", style = TextStyle(color = NC.muted, fontSize = 10.sp, fontWeight = FontWeight.Bold), maxLines = 2)
                Spacer(GlanceModifier.height(6.dp))
                when {
                    !ready -> Text("Ouvre Notch une première fois", style = TextStyle(color = NC.ink, fontSize = 14.sp, fontWeight = FontWeight.Bold))
                    weak == null -> Text("Nouvelle semaine : tout est à faire", style = TextStyle(color = NC.ink, fontSize = 14.sp, fontWeight = FontWeight.Bold), maxLines = 3)
                    else -> {
                        Text("À travailler", style = TextStyle(color = NC.muted, fontSize = 11.sp))
                        Text(weak, style = TextStyle(color = NC.accent, fontSize = 16.sp, fontWeight = FontWeight.Bold), maxLines = 2)
                    }
                }
                Spacer(GlanceModifier.height(6.dp))
                Text("$count/4 séances", style = TextStyle(color = NC.ink, fontSize = 12.sp, fontWeight = FontWeight.Bold))
            }
        }
    }
}
