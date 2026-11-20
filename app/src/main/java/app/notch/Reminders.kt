package app.notch

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZonedDateTime
import java.time.temporal.TemporalAdjusters

/**
 * Rappels :
 * - le rappel de séance (17 h 30 par défaut), seulement les jours d'entraînement et si la séance n'est pas faite ;
 * - le bilan du dimanche à 19 h.
 * Les réglages viennent de l'écran Réglages de l'appli.
 */
object Reminders {
    private const val CH = "reminders"
    const val ACTION_SESSION = "app.notch.REMIND_SESSION"
    const val ACTION_WEEKLY = "app.notch.REMIND_WEEKLY"
    private const val N_SESSION = 21
    private const val N_WEEKLY = 22
    private const val PREFS = "notch_reminders"

    fun createChannel(c: Context) {
        val nm = c.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CH, "Rappels et bilans", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Le rappel de séance et le bilan du dimanche"
            }
        )
    }

    fun save(c: Context, json: String) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("cfg", json).apply()
        scheduleAll(c)
    }

    private fun cfg(c: Context): JSONObject =
        runCatching { JSONObject(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("cfg", null) ?: "{}") }
            .getOrElse { JSONObject() }

    private fun pending(c: Context, action: String, code: Int): PendingIntent =
        PendingIntent.getBroadcast(
            c, code, Intent(c, ReminderReceiver::class.java).setAction(action),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    private fun nextTime(hour: Int, minute: Int, day: DayOfWeek?): Long {
        val now = ZonedDateTime.now()
        var t = now.with(LocalTime.of(hour, minute))
        if (day != null) t = t.with(TemporalAdjusters.nextOrSame(day))
        if (!t.isAfter(now)) t = if (day == null) t.plusDays(1) else t.plusWeeks(1)
        return t.toInstant().toEpochMilli()
    }

    private fun setAt(c: Context, at: Long, pi: PendingIntent) {
        val am = c.getSystemService(AlarmManager::class.java) ?: return
        runCatching {
            val exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
    }

    fun scheduleAll(c: Context) {
        val cfg = cfg(c)
        val am = c.getSystemService(AlarmManager::class.java) ?: return
        val ps = pending(c, ACTION_SESSION, 21)
        val pw = pending(c, ACTION_WEEKLY, 22)
        am.cancel(ps); am.cancel(pw)
        if (cfg.optBoolean("session", true)) {
            val parts = cfg.optString("time", "17:30").split(":")
            val h = parts.getOrNull(0)?.toIntOrNull()?.coerceIn(0, 23) ?: 17
            val m = parts.getOrNull(1)?.toIntOrNull()?.coerceIn(0, 59) ?: 30
            setAt(c, nextTime(h, m, null), ps)
        }
        if (cfg.optBoolean("weekly", true)) setAt(c, nextTime(19, 0, DayOfWeek.SUNDAY), pw)
    }

    private fun canNotify(c: Context) = NotificationManagerCompat.from(c).areNotificationsEnabled()

    fun onSession(c: Context) {
        scheduleAll(c)
        if (!cfg(c).optBoolean("session", true) || !canNotify(c)) return
        val data = WidgetStore.load(c) ?: return
        val info = runCatching { computeNext(data) }.getOrNull() ?: return
        if (info.button == null) return // pas de séance aujourd'hui, ou déjà faite
        val title = if (info.button == "Reprendre") "Ta séance est en cours" else "${info.title} t’attend"
        val start = PendingIntent.getActivity(
            c, 50, MainActivity.intentFor(c, "start:${info.dayId}"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val n = NotificationCompat.Builder(c, CH)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFF2F5FE8.toInt())
            .setContentTitle(title)
            .setContentText(info.sub)
            .setAutoCancel(true)
            .setContentIntent(start)
            .addAction(0, info.button, start)
            .build()
        runCatching { NotificationManagerCompat.from(c).notify(N_SESSION, n) }
    }

    fun onWeekly(c: Context) {
        scheduleAll(c)
        if (!cfg(c).optBoolean("weekly", true) || !canNotify(c)) return
        val data = WidgetStore.load(c) ?: return
        val today = LocalDate.now()
        val monday = today.minusDays((today.dayOfWeek.value - 1).toLong())
        val doneArr = data.optJSONArray("done")
        val sessions = if (doneArr == null) 0 else (0 until doneArr.length()).mapNotNull {
            val d = doneArr.getJSONObject(it)
            val date = runCatching { LocalDate.parse(d.getString("date")) }.getOrNull()
            if (date != null && !date.isBefore(monday)) d.getString("day") else null
        }.toSet().size
        val week = data.optJSONObject("week")
        val sameWeek = week?.optString("monday") == monday.toString()
        val records = if (sameWeek) week!!.optInt("records") else 0
        val heat = data.optJSONObject("heat")
        val weak = if (heat != null && heat.optString("week") == monday.toString() && heat.optBoolean("any")) heat.optString("weak").takeIf { it.isNotBlank() && it != "null" } else null

        val text = if (sessions == 0) "Aucune séance cette semaine. Demain, on repart d’un bon pied."
        else buildString {
            append("$sessions séance${if (sessions > 1) "s" else ""} sur 4")
            if (records > 0) append(" · $records record${if (records > 1) "s" else ""}")
            if (weak != null) append(" · à travailler : ${weak.lowercase()}")
        }
        val open = PendingIntent.getActivity(
            c, 51, MainActivity.intentFor(c, "view:progres"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val n = NotificationCompat.Builder(c, CH)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFF2F5FE8.toInt())
            .setContentTitle(if (sessions >= 4) "Semaine complète" else "Ta semaine")
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()
        runCatching { NotificationManagerCompat.from(c).notify(N_WEEKLY, n) }
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Reminders.ACTION_SESSION -> Reminders.onSession(context)
            Reminders.ACTION_WEEKLY -> Reminders.onWeekly(context)
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> {
                Reminders.scheduleAll(context)
                // Android oublie les zones de géolocalisation au redémarrage
                Gym.register(context)
            }
        }
    }
}
