package app.notch

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import java.lang.ref.WeakReference

/**
 * La séance sur l'écran verrouillé.
 * La page décrit l'état en cours (série, récup, exercice suivant) et ses boutons ;
 * Android l'affiche dès que tu quittes l'appli ou que l'écran s'éteint.
 * Un appui sur un bouton est renvoyé à la page, qui fait l'action puis met la notification à jour.
 */
object Live {
    private const val CH = "session_live"
    private const val N = 13
    private const val PREFS = "notch_live"
    const val ACTION = "app.notch.LIVE_ACTION"
    const val EXTRA_ID = "id"

    /** L'écran Notch ouvert, pour lui transmettre les boutons de la notification. */
    @Volatile
    var activity: WeakReference<MainActivity>? = null

    fun createChannel(c: Context) {
        val nm = c.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CH, "Séance en cours", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Ta série ou ta récup sur l’écran verrouillé, avec ses boutons"
                setSound(null, null)
                enableVibration(false)
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
        )
        // L'ancien compte à rebours seul est remplacé par cette notification
        runCatching { nm.deleteNotificationChannel("rest_timer") }
    }

    private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun state(c: Context): JSONObject? =
        prefs(c).getString("s", null)?.let { runCatching { JSONObject(it) }.getOrNull() }

    fun save(c: Context, json: String) {
        prefs(c).edit().putString("s", json).apply()
        if (!NotchApp.foreground) show(c)
    }

    fun clear(c: Context) {
        prefs(c).edit().remove("s").apply()
        NotificationManagerCompat.from(c).cancel(N)
    }

    /** Fin de récup alors que tu n'es pas dans l'appli : la notification passe à la série suivante. */
    fun promoteAfter(c: Context) {
        val s = state(c) ?: return
        val after = s.optJSONObject("after") ?: return
        save(c, after.toString())
    }

    fun hide(c: Context) = NotificationManagerCompat.from(c).cancel(N)

    private fun openApp(c: Context): PendingIntent =
        PendingIntent.getActivity(
            c, 41, MainActivity.intentFor(c, "resume"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    private fun actionIntent(c: Context, id: String): PendingIntent =
        PendingIntent.getBroadcast(
            c, 4000 + (id.hashCode() and 0xFFF),
            Intent(c, LiveReceiver::class.java).setAction(ACTION).putExtra(EXTRA_ID, id),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    fun show(c: Context) {
        val s = state(c) ?: return
        if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) return
        val now = System.currentTimeMillis()
        val b = NotificationCompat.Builder(c, CH)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFF2F5FE8.toInt())
            .setContentTitle(s.optString("title"))
            .setContentText(s.optString("text"))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory("workout")
            .setTimeoutAfter(4 * 60 * 60_000L)
            .setContentIntent(openApp(c))

        val end = s.optLong("restEnd", 0L)
        if (end > now) {
            b.setUsesChronometer(true).setChronometerCountDown(true).setWhen(end).setShowWhen(true)
        } else {
            b.setShowWhen(false)
        }
        val progress = s.optInt("progress", -1)
        if (progress in 0..100) b.setProgress(100, progress, false)

        val buttons = s.optJSONArray("buttons")
        if (buttons != null) for (i in 0 until minOf(3, buttons.length())) {
            val btn = buttons.optJSONObject(i) ?: continue
            b.addAction(0, btn.optString("label"), actionIntent(c, btn.optString("id")))
        }
        runCatching { NotificationManagerCompat.from(c).notify(N, b.build()) }
    }

    fun onAction(c: Context, id: String) {
        val a = activity?.get()
        if (a != null && !a.isFinishing && !a.isDestroyed) {
            a.js("window.notchAction && notchAction(${JSONObject.quote(id)})")
        } else {
            // L'appli a été fermée par Android : l'action est faite à la prochaine ouverture
            prefs(c).edit().putString("pending", id).apply()
        }
    }

    fun takePending(c: Context): String? {
        val p = prefs(c).getString("pending", null) ?: return null
        prefs(c).edit().remove("pending").apply()
        return p
    }
}

class LiveReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Live.ACTION) return
        val id = intent.getStringExtra(Live.EXTRA_ID) ?: return
        Live.onAction(context, id)
    }
}
