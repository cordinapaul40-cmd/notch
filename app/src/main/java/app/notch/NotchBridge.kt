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
}
