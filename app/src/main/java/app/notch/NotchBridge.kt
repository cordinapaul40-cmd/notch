package app.notch

import android.webkit.JavascriptInterface

/** Ce que la page Notch peut demander au téléphone (window.NotchNative côté JavaScript). */
class NotchBridge(private val activity: MainActivity) {

    @JavascriptInterface
    fun vibrate(pattern: String) {
        Haptics.vibrate(activity, Haptics.parse(pattern))
    }

    @JavascriptInterface
    fun keepAwake(on: Boolean) {
        activity.runOnUiThread { activity.setKeepAwake(on) }
    }

    @JavascriptInterface
    fun scheduleRest(endMs: String, text: String) {
        val end = endMs.toDoubleOrNull()?.toLong() ?: return
        Rest.schedule(activity.applicationContext, end, text)
    }

    @JavascriptInterface
    fun cancelRest() {
        Rest.cancel(activity.applicationContext)
    }

    @JavascriptInterface
    fun requestNotifications() {
        activity.runOnUiThread { activity.askNotifications() }
    }

    @JavascriptInterface
    fun exportData(json: String, name: String) {
        activity.runOnUiThread { activity.export(json, name) }
    }

    @JavascriptInterface
    fun setReminders(json: String) {
        Reminders.save(activity.applicationContext, json)
    }

    @JavascriptInterface
    fun updateWidgets(json: String) {
        WidgetStore.save(activity.applicationContext, json)
    }

    // ---------- Séance sur l'écran verrouillé ----------
    @JavascriptInterface
    fun liveSession(json: String) = Live.save(activity.applicationContext, json)

    @JavascriptInterface
    fun liveClear() = Live.clear(activity.applicationContext)

    // ---------- Permissions ----------
    @JavascriptInterface
    fun hasPerm(name: String): Boolean = activity.hasPerm(name)

    /** Demande une ou plusieurs permissions (séparées par des virgules) ; réponse dans notchPerm(key, ok). */
    @JavascriptInterface
    fun askPerm(key: String, names: String) {
        activity.runOnUiThread { activity.askPerms(key, names.split(",").map { it.trim() }.filter { it.isNotEmpty() }) }
    }

    // ---------- Musique ----------
    @JavascriptInterface
    fun musicAccess(): Boolean = Music.granted(activity)

    @JavascriptInterface
    fun musicOpenAccess() { activity.runOnUiThread { Music.openAccess(activity) } }

    @JavascriptInterface
    fun musicStart() { activity.runOnUiThread { activity.startMusic() } }

    @JavascriptInterface
    fun musicStop() { activity.runOnUiThread { Music.stop() } }

    @JavascriptInterface
    fun musicCmd(cmd: String) { activity.runOnUiThread { Music.command(cmd) } }

    @JavascriptInterface
    fun musicOpen(url: String) { activity.runOnUiThread { if (!Music.open(activity, url)) activity.js("toast('Aucun lecteur de musique trouvé')") } }

    // ---------- Agenda ----------
    @JavascriptInterface
    fun calEvents(from: String, to: String): String {
        val f = from.toDoubleOrNull()?.toLong() ?: return "[]"
        val t = to.toDoubleOrNull()?.toLong() ?: return "[]"
        return Cal.events(activity.applicationContext, f, t)
    }

    @JavascriptInterface
    fun calSync(json: String): String = Cal.sync(activity.applicationContext, json)

    @JavascriptInterface
    fun calRemoveAll(): Int = Cal.removeAll(activity.applicationContext)

    // ---------- Arrivée à la salle ----------
    @JavascriptInterface
    fun gymState(): String = Gym.state(activity.applicationContext)

    /** Position actuelle ; réponse dans notchGymLocated(json ou null). */
    @JavascriptInterface
    fun gymLocate() {
        activity.runOnUiThread {
            Gym.locate(activity) { loc -> activity.js("window.notchGymLocated && notchGymLocated(${loc?.toString() ?: "null"})") }
        }
    }

    @JavascriptInterface
    fun gymSave(json: String) = Gym.save(activity.applicationContext, json)

    @JavascriptInterface
    fun gymOff() = Gym.off(activity.applicationContext)

    @JavascriptInterface
    fun openBasicFit(): Boolean = Gym.openBasicFit(activity)

    /** Ouvre les réglages Android de Notch (permissions refusées une fois pour toutes). */
    @JavascriptInterface
    fun openAppSettings() { activity.runOnUiThread { activity.openAppSettings() } }

    // ---------- Partage (bilan du mois) ----------
    @JavascriptInterface
    fun shareImage(dataUrl: String, text: String) {
        activity.runOnUiThread { activity.shareImage(dataUrl, text) }
    }

    // ---------- Bips de récup (la musique baisse le temps du bip) ----------
    @JavascriptInterface
    fun beep(freq: Double, durMs: Double, vol: Double) {
        activity.runOnUiThread { Beep.play(activity.applicationContext, freq, durMs.toInt().coerceIn(30, 1500), vol) }
    }
}
