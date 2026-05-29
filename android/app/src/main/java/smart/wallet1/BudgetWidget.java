package smart.wallet1;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONObject;

public class BudgetWidget extends AppWidgetProvider {

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences("WidgetPrefs", Context.MODE_PRIVATE);
        String dataStr = prefs.getString("budget_data", "{}");
        boolean isDark = prefs.getBoolean("widget_dark_mode", false);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_budget);

        // Apply Theme
        int bgColor = isDark ? 0xFF1E293B : 0xFFFFFFFF;
        int textColor = isDark ? 0xFFF8FAFC : 0xFF1E293B;
        int subTextColor = isDark ? 0xFF94A3B8 : 0xFF64748B;

        views.setInt(R.id.widget_root, "setBackgroundColor", bgColor);
        views.setTextColor(R.id.widget_budget_title, textColor);
        views.setTextColor(R.id.widget_budget_month, subTextColor);
        
        views.setTextColor(R.id.widget_needs_val, textColor);
        views.setTextColor(R.id.widget_wants_val, textColor);
        views.setTextColor(R.id.widget_savings_val, textColor);

        try {
            JSONObject data = new JSONObject(dataStr);
            views.setTextViewText(R.id.widget_budget_month, data.optString("month", "MONTHLY BUDGET"));
            
            // Needs
            JSONObject needs = data.optJSONObject("needs");
            if (needs != null) {
                views.setTextViewText(R.id.widget_needs_val, needs.optString("left", "₱0") + " LEFT");
                views.setProgressBar(R.id.widget_needs_bar, 100, needs.optInt("percent", 0), false);
            }

            // Wants
            JSONObject wants = data.optJSONObject("wants");
            if (wants != null) {
                views.setTextViewText(R.id.widget_wants_val, wants.optString("left", "₱0") + " LEFT");
                views.setProgressBar(R.id.widget_wants_bar, 100, wants.optInt("percent", 0), false);
            }

            // Savings
            JSONObject savings = data.optJSONObject("savings");
            if (savings != null) {
                views.setTextViewText(R.id.widget_savings_val, savings.optString("left", "₱0") + " LEFT");
                views.setProgressBar(R.id.widget_savings_bar, 100, savings.optInt("percent", 0), false);
            }

            views.setTextViewText(R.id.widget_available_val, "₱" + data.optString("available", "0.00"));
        } catch (Exception e) {
            e.printStackTrace();
        }

        // Deep Link: Open App
        android.content.Intent intent = new android.content.Intent(context, MainActivity.class);
        android.app.PendingIntent pendingIntent = android.app.PendingIntent.getActivity(context, 0, intent, android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }
}
