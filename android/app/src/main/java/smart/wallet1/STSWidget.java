package smart.wallet1;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONObject;

public class STSWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences("WidgetPrefs", Context.MODE_PRIVATE);
        String stsData = prefs.getString("sts_data", null);
        boolean isDark = prefs.getBoolean("widget_dark_mode", false);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_sts);

        // Apply Theme
        int bgColor = isDark ? 0xFF1E293B : 0xFFFFFFFF;
        int textColor = isDark ? 0xFFF8FAFC : 0xFF1E293B;
        int subTextColor = isDark ? 0xFF94A3B8 : 0xFF64748B;

        views.setInt(R.id.widget_root, "setBackgroundColor", bgColor);
        views.setTextColor(R.id.widget_sts_title, textColor);
        views.setTextColor(R.id.widget_sts_subtext, subTextColor);

        if (stsData != null) {
            try {
                JSONObject json = new JSONObject(stsData);
                String amount = json.optString("amount", "₱0.00");
                String subtext = json.optString("subtext", "Safe budget until...");
                boolean isNegative = json.optBoolean("isNegative", false);

                views.setTextViewText(R.id.widget_sts_amount, amount);
                views.setTextViewText(R.id.widget_sts_subtext, subtext);
                
                if (isNegative) {
                    views.setTextColor(R.id.widget_sts_amount, 0xFFEF4444); // Red
                } else {
                    // In dark mode, maybe a slightly brighter green? No, 16A34A is fine.
                    views.setTextColor(R.id.widget_sts_amount, isDark ? 0xFF4ADE80 : 0xFF16A34A);
                }

            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        // Deep link to BPI account
        Intent intent = new Intent(context, MainActivity.class);
        intent.putExtra("targetAccount", "bpi");
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_sts_title, pendingIntent);
        views.setOnClickPendingIntent(R.id.widget_sts_amount, pendingIntent);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
}
