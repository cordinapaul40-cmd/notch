package app.notch

import android.app.Application

class NotchApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Rest.createChannels(this)
        Reminders.createChannel(this)
    }

    companion object {
        /** Vrai quand l'écran de Notch est affiché : la page gère alors elle-même vibrations et sons. */
        @Volatile
        var foreground: Boolean = false
    }
}
