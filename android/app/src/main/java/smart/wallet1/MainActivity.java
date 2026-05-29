package smart.wallet1;

import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private void applySystemBarAppearance() {
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.BLACK);

        WindowInsetsControllerCompat insetsController = WindowCompat.getInsetsController(window, window.getDecorView());
        if (insetsController != null) {
            insetsController.setAppearanceLightStatusBars(true);
            insetsController.setAppearanceLightNavigationBars(false);
        }

        int uiFlags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        window.getDecorView().setSystemUiVisibility(uiFlags);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        applySystemBarAppearance();

        // Ensure cookies and storage are enabled for Firebase Auth stability
        WebView webView = this.getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        // Handle Deep Link from Widgets (Initial Launch)
        String targetAccount = getIntent().getStringExtra("targetAccount");
        if (targetAccount != null) {
            webView.evaluateJavascript("window.startupTargetAccount = '" + targetAccount + "';", null);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        applySystemBarAppearance();
    }

    @Override
    public void onStart() {
        super.onStart();
        applySystemBarAppearance();
    }

    @Override
    public void onPostResume() {
        super.onPostResume();
        applySystemBarAppearance();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applySystemBarAppearance();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String targetAccount = intent.getStringExtra("targetAccount");
        if (targetAccount != null) {
            this.getBridge().getWebView().evaluateJavascript("window.startupTargetAccount = '" + targetAccount + "';", null);
            // Also trigger a re-render if needed
            this.getBridge().getWebView().evaluateJavascript("if(typeof window.handleStartupAccount === 'function') window.handleStartupAccount();", null);
        }
    }
}
