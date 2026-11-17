package app.notch

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/** Vibrations du téléphone. */
object Haptics {
    fun parse(pattern: String): LongArray =
        pattern.split(",").mapNotNull { it.trim().toDoubleOrNull()?.toLong() }.toLongArray()

    @Suppress("DEPRECATION")
    private fun vibrator(c: Context): Vibrator? =
        if (Build.VERSION.SDK_INT >= 31) (c.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        else c.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator

    private fun effect(timings: LongArray): VibrationEffect? = when {
        timings.isEmpty() -> null
        timings.size == 1 -> VibrationEffect.createOneShot(timings[0].coerceAtLeast(1), VibrationEffect.DEFAULT_AMPLITUDE)
        else -> VibrationEffect.createWaveform(longArrayOf(0L) + timings, -1)
    }

    /** Petite vibration de retour pendant que l'appli est ouverte. */
    fun vibrate(c: Context, timings: LongArray) {
        val e = effect(timings) ?: return
        runCatching { vibrator(c)?.vibrate(e) }
    }

    /** Vibration « alarme » : passe même écran verrouillé. */
    @Suppress("DEPRECATION")
    fun alarm(c: Context, timings: LongArray) {
        val e = effect(timings) ?: return
        val v = vibrator(c) ?: return
        runCatching {
            if (Build.VERSION.SDK_INT >= 33) v.vibrate(e, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM))
            else v.vibrate(e, AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build())
        }
    }
}

/**
 * Le minuteur de récupération côté Android.
 * La page garde la main quand Notch est à l'écran. Si l'écran s'éteint ou si tu sors de l'appli,
 * Android prend le relais : compte à rebours dans les notifications, vibration à chaque seconde
 * sur les 10 dernières, puis alerte « C'est reparti ».
 */
object Rest {
    private const val CH_TIMER = "rest_timer"
    private const val CH_END = "rest_end"
    private const val N_TIMER = 11
    private const val N_END = 12
    const val ACTION_WARN = "app.notch.REST_WARN"
    const val ACTION_END = "app.notch.REST_END"
    private const val PREFS = "notch_rest"

    fun createChannels(c: Context) {
        val nm = c.getSystemService(NotificationManager::class.java) ?: return
        val timer = NotificationChannel(CH_TIMER, "Récupération en cours", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Le compte à rebours de ta récup quand tu quittes l’appli"
            setShowBadge(false)
        }
        val end = NotificationChannel(CH_END, "Fin de récupération", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "L’alerte qui te dit de repartir sur ta série"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 300, 120, 300)
            setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build()
            )
        }
        nm.createNotificationChannel(timer)
        nm.createNotificationChannel(end)
    }

    private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun pending(c: Context, action: String, code: Int): PendingIntent =
        PendingIntent.getBroadcast(
            c, code, Intent(c, RestReceiver::class.java).setAction(action),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    private fun openApp(c: Context): PendingIntent =
        PendingIntent.getActivity(
            c, 40, MainActivity.intentFor(c, "today"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    private fun setAlarm(c: Context, at: Long, pi: PendingIntent) {
        val am = c.getSystemService(AlarmManager::class.java) ?: return
        runCatching {
            val exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
    }

    fun schedule(c: Context, endMs: Long, text: String) {
        prefs(c).edit().putLong("end", endMs).putString("text", text).apply()
        val now = System.currentTimeMillis()
        val am = c.getSystemService(AlarmManager::class.java)
        val warn = pending(c, ACTION_WARN, 1)
        val end = pending(c, ACTION_END, 2)
        am?.cancel(warn)
        if (endMs - 10_000 > now) setAlarm(c, endMs - 10_000, warn)
        setAlarm(c, endMs, end)
        if (!NotchApp.foreground) showTimer(c)
    }

    fun cancel(c: Context) {
        prefs(c).edit().remove("end").apply()
        val am = c.getSystemService(AlarmManager::class.java)
        am?.cancel(pending(c, ACTION_WARN, 1))
        am?.cancel(pending(c, ACTION_END, 2))
        NotificationManagerCompat.from(c).cancel(N_TIMER)
    }

    fun onForeground(c: Context) {
        val nm = NotificationManagerCompat.from(c)
        nm.cancel(N_TIMER)
        nm.cancel(N_END)
    }

    fun onBackground(c: Context) {
        showTimer(c)
    }

    private fun canNotify(c: Context) = NotificationManagerCompat.from(c).areNotificationsEnabled()

    private fun showTimer(c: Context) {
        val end = prefs(c).getLong("end", 0L)
        val now = System.currentTimeMillis()
        if (end <= now || !canNotify(c)) return
        val n = NotificationCompat.Builder(c, CH_TIMER)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Récupération")
            .setContentText("Ensuite : " + (prefs(c).getString("text", "") ?: ""))
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setWhen(end)
            .setShowWhen(true)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setTimeoutAfter(end - now + 5_000)
            .setContentIntent(openApp(c))
            .build()
        runCatching { NotificationManagerCompat.from(c).notify(N_TIMER, n) }
    }

    fun onWarn(c: Context) {
        if (NotchApp.foreground) return
        // Une impulsion par seconde pendant les 10 dernières secondes
        val t = mutableListOf<Long>()
        repeat(10) { t += 70L; t += 930L }
        Haptics.alarm(c, t.dropLast(1).toLongArray())
    }

    fun onEnd(c: Context) {
        val text = prefs(c).getString("text", "") ?: ""
        prefs(c).edit().remove("end").apply()
        NotificationManagerCompat.from(c).cancel(N_TIMER)
        if (NotchApp.foreground) return
        Haptics.alarm(c, longArrayOf(400, 150, 400))
        if (!canNotify(c)) return
        val n = NotificationCompat.Builder(c, CH_END)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("C’est reparti")
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setTimeoutAfter(5 * 60_000L)
            .setContentIntent(openApp(c))
            .build()
        runCatching { NotificationManagerCompat.from(c).notify(N_END, n) }
    }
}

class RestReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Rest.ACTION_WARN -> Rest.onWarn(context)
            Rest.ACTION_END -> Rest.onEnd(context)
        }
    }
}
