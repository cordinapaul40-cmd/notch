package app.notch

import android.Manifest
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CalendarContract
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.TimeZone

/**
 * L'agenda du téléphone (dont ton agenda Google synchronisé) :
 * - lecture des événements de la semaine pour repérer les conflits avec tes séances ;
 * - ajout de tes séances dans l'agenda, si tu l'actives.
 * Les séances ajoutées par Notch sont reconnues grâce à « notch: » dans leur description.
 */
object Cal {
    private const val MARK = "notch:"

    fun canRead(c: Context) = has(c, Manifest.permission.READ_CALENDAR)
    fun canWrite(c: Context) = has(c, Manifest.permission.WRITE_CALENDAR) && canRead(c)
    private fun has(c: Context, p: String) = ContextCompat.checkSelfPermission(c, p) == PackageManager.PERMISSION_GRANTED

    /** Événements entre deux dates (millisecondes), répétitions comprises. */
    fun events(c: Context, from: Long, to: Long): String {
        val out = JSONArray()
        if (!canRead(c)) return out.toString()
        val uri = CalendarContract.Instances.CONTENT_URI.buildUpon().also {
            ContentUris.appendId(it, from)
            ContentUris.appendId(it, to)
        }.build()
        val proj = arrayOf(
            CalendarContract.Instances.TITLE,
            CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.END,
            CalendarContract.Instances.ALL_DAY,
            CalendarContract.Instances.AVAILABILITY,
            CalendarContract.Instances.DESCRIPTION,
            CalendarContract.Instances.SELF_ATTENDEE_STATUS,
            CalendarContract.Instances.VISIBLE,
        )
        runCatching {
            c.contentResolver.query(uri, proj, null, null, CalendarContract.Instances.BEGIN + " ASC")?.use { cur ->
                while (cur.moveToNext()) {
                    if (cur.getInt(7) == 0) continue // agenda masqué
                    if (cur.getInt(6) == CalendarContract.Attendees.ATTENDEE_STATUS_DECLINED) continue
                    val desc = cur.getString(5) ?: ""
                    out.put(JSONObject().apply {
                        put("title", cur.getString(0) ?: "Occupé")
                        put("begin", cur.getLong(1))
                        put("end", cur.getLong(2))
                        put("allDay", cur.getInt(3) == 1)
                        put("free", cur.getInt(4) == CalendarContract.Events.AVAILABILITY_FREE)
                        put("notch", desc.contains(MARK))
                    })
                }
            }
        }
        return out.toString()
    }

    /** L'agenda où écrire : le principal du compte Google, sinon le premier modifiable. */
    private fun target(c: Context): Pair<Long, String>? {
        val proj = arrayOf(
            CalendarContract.Calendars._ID,
            CalendarContract.Calendars.ACCOUNT_TYPE,
            CalendarContract.Calendars.IS_PRIMARY,
            CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL,
            CalendarContract.Calendars.VISIBLE,
            CalendarContract.Calendars.ACCOUNT_NAME,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
        )
        data class C(val id: Long, val google: Boolean, val primary: Boolean, val name: String)
        val list = mutableListOf<C>()
        runCatching {
            c.contentResolver.query(CalendarContract.Calendars.CONTENT_URI, proj, null, null, null)?.use { cur ->
                while (cur.moveToNext()) {
                    if (cur.getInt(3) < CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR || cur.getInt(4) == 0) continue
                    list += C(cur.getLong(0), cur.getString(1) == "com.google", cur.getInt(2) == 1, cur.getString(5) ?: cur.getString(6) ?: "")
                }
            }
        }
        val best = list.firstOrNull { it.google && it.primary } ?: list.firstOrNull { it.primary } ?: list.firstOrNull { it.google } ?: list.firstOrNull()
        return best?.let { it.id to it.name }
    }

    /**
     * Met l'agenda à jour avec les séances à venir de la semaine.
     * json : { from, to, items: [{ key, title, begin, end }] }
     * Ne touche qu'aux événements créés par Notch, et jamais à ceux déjà passés.
     */
    fun sync(c: Context, json: String): String {
        val res = JSONObject()
        if (!canWrite(c)) return res.put("ok", false).put("why", "permission").toString()
        val t = target(c) ?: return res.put("ok", false).put("why", "calendar").toString()
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return res.put("ok", false).toString()
        val from = o.optLong("from"); val to = o.optLong("to")
        val now = System.currentTimeMillis()
        val items = o.optJSONArray("items") ?: JSONArray()
        val cr = c.contentResolver

        // Séances Notch déjà dans l'agenda, cette semaine
        data class Ex(val id: Long, val begin: Long, val end: Long, val title: String)
        val existing = mutableMapOf<String, Ex>()
        runCatching {
            cr.query(
                CalendarContract.Events.CONTENT_URI,
                arrayOf(CalendarContract.Events._ID, CalendarContract.Events.DESCRIPTION, CalendarContract.Events.DTSTART, CalendarContract.Events.DTEND, CalendarContract.Events.TITLE),
                "${CalendarContract.Events.CALENDAR_ID} = ? AND ${CalendarContract.Events.DTSTART} >= ? AND ${CalendarContract.Events.DTSTART} < ? AND ${CalendarContract.Events.DELETED} = 0 AND ${CalendarContract.Events.DESCRIPTION} LIKE ?",
                arrayOf(t.first.toString(), from.toString(), to.toString(), "%$MARK%"), null
            )?.use { cur ->
                while (cur.moveToNext()) {
                    val desc = cur.getString(1) ?: continue
                    val key = desc.substringAfter(MARK).substringBefore("\n").trim()
                    existing[key] = Ex(cur.getLong(0), cur.getLong(2), cur.getLong(3), cur.getString(4) ?: "")
                }
            }
        }

        var added = 0; var moved = 0; var removed = 0
        val keep = mutableSetOf<String>()
        for (i in 0 until items.length()) {
            val it = items.optJSONObject(i) ?: continue
            val key = it.optString("key"); val begin = it.optLong("begin"); val end = it.optLong("end")
            val title = it.optString("title")
            if (key.isBlank() || begin <= 0) continue
            keep += key
            val ex = existing[key]
            val desc = "Séance Notch : ${it.optString("detail")}\n$MARK$key"
            if (ex == null) {
                if (begin < now) continue
                val v = ContentValues().apply {
                    put(CalendarContract.Events.CALENDAR_ID, t.first)
                    put(CalendarContract.Events.TITLE, title)
                    put(CalendarContract.Events.DESCRIPTION, desc)
                    put(CalendarContract.Events.DTSTART, begin)
                    put(CalendarContract.Events.DTEND, end)
                    put(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().id)
                    put(CalendarContract.Events.AVAILABILITY, CalendarContract.Events.AVAILABILITY_BUSY)
                }
                if (runCatching { cr.insert(CalendarContract.Events.CONTENT_URI, v) }.getOrNull() != null) added++
            } else if (ex.begin != begin || ex.end != end || ex.title != title) {
                if (ex.begin < now && begin < now) continue
                val v = ContentValues().apply {
                    put(CalendarContract.Events.TITLE, title)
                    put(CalendarContract.Events.DTSTART, begin)
                    put(CalendarContract.Events.DTEND, end)
                    put(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().id)
                }
                if (runCatching { cr.update(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, ex.id), v, null, null) }.getOrDefault(0) > 0) moved++
            }
        }
        // Séances retirées du planning (déplacées à une autre semaine, désactivées…) : seulement celles à venir
        existing.forEach { (key, ex) ->
            if (key !in keep && ex.begin >= now) {
                if (runCatching { cr.delete(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, ex.id), null, null) }.getOrDefault(0) > 0) removed++
            }
        }
        return res.put("ok", true).put("calendar", t.second).put("added", added).put("moved", moved).put("removed", removed).toString()
    }

    /** Retire toutes les séances Notch à venir (quand tu désactives l'option). */
    fun removeAll(c: Context): Int {
        if (!canWrite(c)) return 0
        return runCatching {
            c.contentResolver.delete(
                CalendarContract.Events.CONTENT_URI,
                "${CalendarContract.Events.DTSTART} >= ? AND ${CalendarContract.Events.DESCRIPTION} LIKE ?",
                arrayOf(System.currentTimeMillis().toString(), "%$MARK%")
            )
        }.getOrDefault(0)
    }
}
