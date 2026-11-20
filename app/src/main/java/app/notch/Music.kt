package app.notch

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.util.Base64
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * Service vide : il ne lit pas tes notifications. Android exige qu'il existe (et que tu l'autorises)
 * pour qu'une appli puisse voir et piloter le lecteur de musique en cours.
 */
class MediaListener : NotificationListenerService()

/**
 * Le mini-lecteur : Notch pilote le lecteur qui joue en ce moment (Spotify, Deezer, YouTube Music…),
 * sans compte développeur ni abonnement particulier.
 */
object Music {
    /** Lecteurs connus : nom affiché, et lancement si rien ne joue. */
    val PLAYERS = linkedMapOf(
        "com.spotify.music" to "Spotify",
        "deezer.android.app" to "Deezer",
        "com.google.android.apps.youtube.music" to "YouTube Music",
        "com.apple.android.music" to "Apple Music",
        "com.amazon.mp3" to "Amazon Music",
        "com.soundcloud.android" to "SoundCloud",
        "com.qobuz.music" to "Qobuz",
    )

    private var mgr: MediaSessionManager? = null
    private var controller: MediaController? = null
    private var sessionsListener: MediaSessionManager.OnActiveSessionsChangedListener? = null
    private var push: ((String) -> Unit)? = null
    private var appContext: Context? = null
    private var lastArtKey: String? = null
    private val main = Handler(Looper.getMainLooper())

    private val callback = object : MediaController.Callback() {
        override fun onMetadataChanged(metadata: MediaMetadata?) = emit()
        override fun onPlaybackStateChanged(state: PlaybackState?) = emit()
        override fun onSessionDestroyed() {
            controller?.unregisterCallback(this)
            controller = null
            refresh()
        }
    }

    fun granted(c: Context): Boolean =
        NotificationManagerCompat.getEnabledListenerPackages(c).contains(c.packageName)

    fun openAccess(a: Activity) {
        val comp = ComponentName(a, MediaListener::class.java).flattenToString()
        val detail = if (Build.VERSION.SDK_INT >= 30)
            Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
                .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, comp)
        else null
        val ok = detail != null && runCatching { a.startActivity(detail) }.isSuccess
        if (!ok) runCatching { a.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }
    }

    /** Démarre le suivi du lecteur ; chaque changement est envoyé à la page. Toujours sur le fil principal. */
    fun start(c: Context, onState: (String) -> Unit) {
        stop()
        appContext = c.applicationContext
        push = onState
        lastArtKey = null
        if (!granted(c)) { emit(); return }
        val m = c.getSystemService(MediaSessionManager::class.java) ?: run { emit(); return }
        mgr = m
        val comp = ComponentName(c, MediaListener::class.java)
        runCatching {
            val l = MediaSessionManager.OnActiveSessionsChangedListener { list -> pick(list) }
            m.addOnActiveSessionsChangedListener(l, comp, main)
            sessionsListener = l
            pick(m.getActiveSessions(comp))
        }.onFailure { emit() }
    }

    fun stop() {
        runCatching { sessionsListener?.let { mgr?.removeOnActiveSessionsChangedListener(it) } }
        sessionsListener = null
        controller?.unregisterCallback(callback)
        controller = null
        push = null
    }

    private fun refresh() {
        val c = appContext ?: return
        val m = mgr ?: return
        runCatching { pick(m.getActiveSessions(ComponentName(c, MediaListener::class.java))) }.onFailure { emit() }
    }

    private fun isPlaying(mc: MediaController) = mc.playbackState?.state == PlaybackState.STATE_PLAYING

    private fun pick(list: List<MediaController>?) {
        // Le lecteur qui joue en priorité, sinon le dernier utilisé
        val best = list?.firstOrNull { isPlaying(it) } ?: list?.firstOrNull()
        if (best?.sessionToken != controller?.sessionToken) {
            controller?.unregisterCallback(callback)
            controller = best
            best?.registerCallback(callback, main)
            lastArtKey = null
        }
        emit()
    }

    private fun emit() {
        val p = push ?: return
        val c = appContext
        val o = JSONObject()
        o.put("granted", c != null && granted(c))
        val mc = controller
        if (mc != null) {
            val md = mc.metadata
            val title = md?.getString(MediaMetadata.METADATA_KEY_TITLE) ?: md?.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE)
            val artist = md?.getString(MediaMetadata.METADATA_KEY_ARTIST) ?: md?.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST)
            o.put("has", true)
            o.put("title", title ?: "")
            o.put("artist", artist ?: "")
            o.put("app", PLAYERS[mc.packageName] ?: appLabel(c, mc.packageName))
            o.put("playing", isPlaying(mc))
            val key = mc.packageName + "|" + (title ?: "") + "|" + (artist ?: "")
            if (key != lastArtKey) {
                lastArtKey = key
                val bmp = md?.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART)
                    ?: md?.getBitmap(MediaMetadata.METADATA_KEY_ART)
                    ?: md?.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON)
                o.put("art", bmp?.let { toDataUrl(it) } ?: "")
            }
        } else {
            o.put("has", false)
        }
        p(o.toString())
    }

    private fun appLabel(c: Context?, pkg: String): String =
        runCatching {
            val pm = c!!.packageManager
            pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
        }.getOrDefault("ton lecteur")

    private fun toDataUrl(src: Bitmap): String? = runCatching {
        val size = 128
        val scale = size.toFloat() / maxOf(src.width, src.height)
        val bmp = if (scale < 1f) Bitmap.createScaledBitmap(src, (src.width * scale).toInt().coerceAtLeast(1), (src.height * scale).toInt().coerceAtLeast(1), true) else src
        val out = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.JPEG, 82, out)
        "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }.getOrNull()

    fun command(cmd: String) {
        val mc = controller ?: return
        val t = mc.transportControls
        runCatching {
            when (cmd) {
                "toggle" -> if (isPlaying(mc)) t.pause() else t.play()
                "next" -> t.skipToNext()
                "prev" -> t.skipToPrevious()
            }
        }
    }

    /** Ouvre la playlist de la séance (lien Spotify, Deezer…) ou, à défaut, le premier lecteur installé. */
    fun open(a: Activity, url: String): Boolean {
        if (url.isNotBlank()) {
            if (runCatching { a.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }.isSuccess) return true
        }
        val pm = a.packageManager
        // Le lecteur utilisé en dernier, sinon le premier installé
        val last = controller?.packageName
        val order = listOfNotNull(last) + PLAYERS.keys
        for (pkg in order) {
            val i = pm.getLaunchIntentForPackage(pkg) ?: continue
            if (runCatching { a.startActivity(i) }.isSuccess) return true
        }
        return false
    }
}
