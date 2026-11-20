package app.notch

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Handler
import android.os.Looper
import kotlin.math.PI
import kotlin.math.min
import kotlin.math.sin

/**
 * Les bips de fin de récup, joués comme un GPS : la musique (Spotify…) continue,
 * baisse le temps du bip, puis remonte. Le son suit le volume de la musique, donc s'entend dans les écouteurs.
 * Sur les 3 dernières secondes, la musique reste baissée d'un bip à l'autre au lieu de monter et descendre.
 */
object Beep {
    private const val RATE = 44100
    private val main = Handler(Looper.getMainLooper())
    private var focus: AudioFocusRequest? = null
    private val release = Runnable { abandon() }

    private val attrs: AudioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()

    fun play(c: Context, freq: Double, durMs: Int, vol: Double) {
        val am = c.getSystemService(AudioManager::class.java) ?: return
        main.removeCallbacks(release)
        if (focus == null) {
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(attrs)
                .setOnAudioFocusChangeListener { }
                .build()
            if (am.requestAudioFocus(req) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) focus = req
        }
        val track = runCatching { tone(freq, durMs, vol) }.getOrNull()
        if (track == null) { scheduleRelease(c, 300); return }
        runCatching { track.play() }
        main.postDelayed({ runCatching { track.release() } }, durMs + 200L)
        // La musique remonte un peu après le dernier bip
        scheduleRelease(c, durMs + 1100L)
    }

    private fun scheduleRelease(c: Context, ms: Long) {
        main.removeCallbacks(release)
        main.postDelayed(release, ms)
        appContext = c.applicationContext
    }

    private var appContext: Context? = null

    private fun abandon() {
        val am = appContext?.getSystemService(AudioManager::class.java)
        focus?.let { am?.abandonAudioFocusRequest(it) }
        focus = null
    }

    /** Un bip sinusoïdal avec montée et descente douces (pas de « clic »). */
    private fun tone(freq: Double, durMs: Int, vol: Double): AudioTrack {
        val n = RATE * durMs / 1000
        val pcm = ShortArray(n)
        val fade = min(n / 4, RATE / 100) // 10 ms
        val amp = (vol.coerceIn(0.0, 1.0) * Short.MAX_VALUE)
        for (i in 0 until n) {
            val env = when {
                i < fade -> i.toDouble() / fade
                i > n - fade -> (n - i).toDouble() / fade
                else -> 1.0
            }
            pcm[i] = (sin(2 * PI * freq * i / RATE) * amp * env).toInt().toShort()
        }
        val track = AudioTrack.Builder()
            .setAudioAttributes(attrs)
            .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(RATE).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setTransferMode(AudioTrack.MODE_STATIC)
            .setBufferSizeInBytes(n * 2)
            .build()
        track.write(pcm, 0, n)
        return track
    }
}
