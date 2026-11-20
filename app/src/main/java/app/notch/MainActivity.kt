package app.notch

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import kotlin.math.roundToInt

class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private var pageReady = false
    private var pendingAction: String? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingExport: String? = null

    private val pickFile = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        fileCallback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
        fileCallback = null
    }

    private val createDoc = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val data = pendingExport
        pendingExport = null
        if (uri == null || data == null) return@registerForActivityResult
        val ok = runCatching {
            contentResolver.openOutputStream(uri)?.use { it.write(data.toByteArray(Charsets.UTF_8)) }
        }.isSuccess
        js(if (ok) "toast('Sauvegarde enregistrée')" else "toast('Impossible d’enregistrer le fichier')")
    }

    private val askNotif = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    // Permissions demandées par la page (agenda, localisation) : la réponse lui est renvoyée
    private var permKey: String? = null
    private val askPermsLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { res ->
        val key = permKey ?: return@registerForActivityResult
        permKey = null
        val ok = res.isNotEmpty() && res.values.all { it }
        js("window.notchPerm && notchPerm(${JSONObject.quote(key)}, $ok)")
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Live.activity = java.lang.ref.WeakReference(this)

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this)
        web.setBackgroundColor(ContextCompat.getColor(this, R.color.bg))
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            // Respecte la taille de texte choisie dans les réglages Android
            textZoom = (resources.configuration.fontScale * 100).roundToInt()
            allowFileAccess = false
        }
        web.addJavascriptInterface(NotchBridge(this), "NotchNative")

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == "appassets.androidplatform.net") return false
                // Liens externes (démos YouTube…) : ouverts dans l'appli adaptée
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                pageReady = true
                pendingAction?.let { deliver(it) }
                pendingAction = null
                // Bouton de la notification touché alors que l'appli était fermée
                Live.takePending(this@MainActivity)?.let { id ->
                    web.evaluateJavascript("window.notchAction && notchAction(${JSONObject.quote(id)})", null)
                }
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = filePathCallback
                return try {
                    pickFile.launch("*/*")
                    true
                } catch (e: Exception) {
                    fileCallback = null
                    false
                }
            }
        }

        setContentView(web)
        styleBars()
        pendingAction = actionFrom(intent)
        // Ouverture depuis un widget ou une notification : pas d'animation d'ouverture
        web.loadUrl("https://appassets.androidplatform.net/assets/index.html" + if (pendingAction != null) "?action=1" else "")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("window.notchBack ? notchBack() : false") { result ->
                    if (result != "true") {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                        isEnabled = true
                    }
                }
            }
        })
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val action = actionFrom(intent) ?: return
        if (pageReady) deliver(action) else pendingAction = action
    }

    override fun onResume() {
        super.onResume()
        NotchApp.foreground = true
        Rest.onForeground(this)
    }

    override fun onPause() {
        NotchApp.foreground = false
        Rest.onBackground(this)
        super.onPause()
    }

    override fun onDestroy() {
        if (Live.activity?.get() === this) Live.activity = null
        Music.stop()
        super.onDestroy()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        styleBars()
    }

    // ---------- Appelés par le pont JavaScript ----------

    fun setKeepAwake(on: Boolean) {
        if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    fun askNotifications() {
        if (Build.VERSION.SDK_INT < 33) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        val prefs = getSharedPreferences("notch_app", MODE_PRIVATE)
        if (prefs.getBoolean("askedNotif", false)) return
        prefs.edit().putBoolean("askedNotif", true).apply()
        runCatching { askNotif.launch(Manifest.permission.POST_NOTIFICATIONS) }
    }

    fun export(json: String, name: String) {
        pendingExport = json
        runCatching { createDoc.launch(name) }.onFailure { pendingExport = null }
    }

    fun hasPerm(name: String): Boolean =
        ContextCompat.checkSelfPermission(this, name) == PackageManager.PERMISSION_GRANTED

    fun askPerms(key: String, names: List<String>) {
        val missing = names.filter { !hasPerm(it) }
        if (missing.isEmpty()) { js("window.notchPerm && notchPerm(${JSONObject.quote(key)}, true)"); return }
        permKey = key
        runCatching { askPermsLauncher.launch(missing.toTypedArray()) }.onFailure {
            permKey = null
            js("window.notchPerm && notchPerm(${JSONObject.quote(key)}, false)")
        }
    }

    fun openAppSettings() {
        runCatching {
            startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
        }
    }

    /** Partage une image (PNG en data URL) avec le texte qui l'accompagne. */
    fun shareImage(dataUrl: String, text: String) {
        runCatching {
            val bytes = android.util.Base64.decode(dataUrl.substringAfter(","), android.util.Base64.DEFAULT)
            val dir = java.io.File(cacheDir, "share").apply { mkdirs() }
            val file = java.io.File(dir, "notch-mois.png")
            file.writeBytes(bytes)
            val uri = androidx.core.content.FileProvider.getUriForFile(this, "app.notch.files", file)
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "image/png"
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_TEXT, text)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(send, "Partager ton mois"))
        }.onFailure { js("toast('Partage impossible')") }
    }

    fun startMusic() {
        Music.start(this) { json -> js("window.notchMusic && notchMusic($json)") }
    }

    fun js(code: String) {
        runOnUiThread { if (::web.isInitialized) web.evaluateJavascript(code, null) }
    }

    // ---------- Interne ----------

    private fun deliver(action: String) {
        web.evaluateJavascript("window.notchOpen && notchOpen(${JSONObject.quote(action)})", null)
    }

    private fun actionFrom(intent: Intent?): String? = intent?.getStringExtra(EXTRA_OPEN)

    private fun styleBars() {
        val night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        window.statusBarColor = ContextCompat.getColor(this, R.color.bg)
        window.navigationBarColor = ContextCompat.getColor(this, R.color.bar)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = !night
            isAppearanceLightNavigationBars = !night
        }
    }

    companion object {
        const val EXTRA_OPEN = "open"

        fun intentFor(context: android.content.Context, action: String): Intent =
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(EXTRA_OPEN, action)
                data = Uri.parse("notch://open/$action")
            }
    }
}
