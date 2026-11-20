package app.notch

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import org.json.JSONObject
import java.time.LocalDate

/**
 * Arrivée à la salle : quand tu restes 2 minutes dans un rayon de 150 m autour de l'endroit enregistré,
 * Notch te propose la séance du jour et l'accès rapide à l'appli Basic-Fit (QR code d'entrée).
 * Rien ne se passe les jours de repos ou si la séance est déjà faite.
 */
object Gym {
    private const val PREFS = "notch_gym"
    private const val CH = "gym"
    private const val N = 31
    const val ACTION = "app.notch.GYM"
    const val BASIC_FIT = "com.basicfit.trainingApp"

    fun createChannel(c: Context) {
        val nm = c.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CH, "Arrivée à la salle", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Ta séance du jour proposée quand tu arrives à la salle"
            }
        )
    }

    private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun hasFine(c: Context) = ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    fun hasBackground(c: Context) = Build.VERSION.SDK_INT < 29 ||
        ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED

    /** L'état pour l'écran Réglages. */
    fun state(c: Context): String {
        val cfg = cfg(c) ?: JSONObject()
        return cfg.put("fine", hasFine(c)).put("background", hasBackground(c))
            .put("basicFit", c.packageManager.getLaunchIntentForPackage(BASIC_FIT) != null).toString()
    }

    private fun cfg(c: Context): JSONObject? =
        prefs(c).getString("cfg", null)?.let { runCatching { JSONObject(it) }.getOrNull() }

    /** json : { lat, lng, acc, name, on } — enregistré depuis l'appli. */
    fun save(c: Context, json: String) {
        prefs(c).edit().putString("cfg", json).apply()
        register(c)
    }

    fun off(c: Context) {
        val cfg = cfg(c) ?: return
        prefs(c).edit().putString("cfg", cfg.put("on", false).toString()).apply()
        unregister(c)
    }

    private fun pending(c: Context): PendingIntent {
        // Le service de localisation doit pouvoir compléter cet intent : il est donc modifiable
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
        return PendingIntent.getBroadcast(c, 60, Intent(c, GymReceiver::class.java).setAction(ACTION), flags)
    }

    @SuppressLint("MissingPermission")
    fun register(c: Context) {
        val cfg = cfg(c) ?: return
        if (!cfg.optBoolean("on", true) || !cfg.has("lat")) { unregister(c); return }
        if (!hasFine(c) || !hasBackground(c)) return
        val fence = Geofence.Builder()
            .setRequestId("gym")
            .setCircularRegion(cfg.getDouble("lat"), cfg.getDouble("lng"), 150f)
            .setExpirationDuration(Geofence.NEVER_EXPIRE)
            .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_DWELL)
            .setLoiteringDelay(2 * 60_000)
            .build()
        // Pas d'alerte immédiate si tu es déjà dans la zone au moment de l'enregistrement
        val req = GeofencingRequest.Builder().setInitialTrigger(0).addGeofence(fence).build()
        runCatching { LocationServices.getGeofencingClient(c).addGeofences(req, pending(c)) }
    }

    fun unregister(c: Context) {
        runCatching { LocationServices.getGeofencingClient(c).removeGeofences(pending(c)) }
    }

    /** La position actuelle, pour enregistrer la salle. */
    @SuppressLint("MissingPermission")
    fun locate(c: Context, done: (JSONObject?) -> Unit) {
        if (!hasFine(c)) { done(null); return }
        runCatching {
            LocationServices.getFusedLocationProviderClient(c)
                .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, CancellationTokenSource().token)
                .addOnSuccessListener { loc ->
                    done(loc?.let { JSONObject().put("lat", it.latitude).put("lng", it.longitude).put("acc", it.accuracy.toDouble()) })
                }
                .addOnFailureListener { done(null) }
        }.onFailure { done(null) }
    }

    fun onEvent(c: Context, intent: Intent) {
        val ev = GeofencingEvent.fromIntent(intent) ?: return
        if (ev.hasError() || ev.geofenceTransition != Geofence.GEOFENCE_TRANSITION_DWELL) return
        val today = LocalDate.now().toString()
        if (prefs(c).getString("last", null) == today) return // une seule fois par jour
        if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) return
        val data = WidgetStore.load(c) ?: return
        val info = runCatching { computeNext(data) }.getOrNull() ?: return
        if (info.button == null) return // jour de repos ou séance déjà faite
        prefs(c).edit().putString("last", today).apply()

        val name = cfg(c)?.optString("name")?.takeIf { it.isNotBlank() } ?: "à la salle"
        val start = PendingIntent.getActivity(
            c, 61, MainActivity.intentFor(c, "start:${info.dayId}"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val b = NotificationCompat.Builder(c, CH)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFF2F5FE8.toInt())
            .setContentTitle("Tu es $name")
            .setContentText("${info.title} · ${info.sub}")
            .setStyle(NotificationCompat.BigTextStyle().bigText("${info.label} : ${info.title}\n${info.sub}"))
            .setAutoCancel(true)
            .setContentIntent(start)
            .setTimeoutAfter(3 * 60 * 60_000L)

        // Le QR code d'entrée est dans l'appli Basic-Fit : on l'ouvre (ou sa page sur le Play Store)
        val bf = c.packageManager.getLaunchIntentForPackage(BASIC_FIT)
            ?: Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$BASIC_FIT"))
        bf.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        b.addAction(0, "Ouvrir Basic-Fit", PendingIntent.getActivity(c, 62, bf, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        b.addAction(0, "${info.button} ${info.tab}", start)
        runCatching { NotificationManagerCompat.from(c).notify(N, b.build()) }
    }

    fun openBasicFit(c: Context): Boolean {
        val i = c.packageManager.getLaunchIntentForPackage(BASIC_FIT) ?: return false
        return runCatching { c.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.isSuccess
    }
}

class GymReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Gym.ACTION) Gym.onEvent(context, intent)
    }
}
