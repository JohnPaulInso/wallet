package smart.wallet1;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

public class ChartWidget extends AppWidgetProvider {

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences("WidgetPrefs", Context.MODE_PRIVATE);
        String dataStr = prefs.getString("chart_data", null);
        boolean isDark = prefs.getBoolean("widget_dark_mode", false);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_chart);

        // Apply Theme
        int bgColor = isDark ? 0xFF1E293B : 0xFFFFFFFF;
        int textColor = isDark ? 0xFFF8FAFC : 0xFF1E293B;

        views.setInt(R.id.widget_root, "setBackgroundColor", bgColor);
        views.setTextColor(R.id.widget_chart_title, textColor);

        if (dataStr != null) {
            try {
                JSONObject data = new JSONObject(dataStr);
                JSONArray categories = data.optJSONArray("categories");

                if (categories != null && categories.length() > 0) {
                    float[] percentages = new float[categories.length()];
                    String[] colors = new String[categories.length()];

                    for (int i = 0; i < categories.length(); i++) {
                        JSONObject cat = categories.getJSONObject(i);
                        percentages[i] = (float) cat.optDouble("percent", 0.0);
                        colors[i] = cat.optString("color", "#3b82f6");

                        // Update labels (up to 4)
                        if (i < 4) {
                            int rowId = context.getResources().getIdentifier("row" + (i + 1), "id", context.getPackageName());
                            int txtId = context.getResources().getIdentifier("txt" + (i + 1), "id", context.getPackageName());
                            if (rowId != 0 && txtId != 0) {
                                views.setViewVisibility(rowId, View.VISIBLE);
                                views.setTextViewText(txtId, cat.optString("name", "") + ": " + cat.optString("amount", "₱0"));
                                views.setTextColor(txtId, textColor);
                            }
                        }
                    }

                    Bitmap donut = WidgetUtils.drawDonutChart(400, percentages, colors);
                    if (donut != null) {
                        views.setImageViewBitmap(R.id.widget_donut_chart, donut);
                    }
                }

            } catch (Exception e) {
                e.printStackTrace();
            }
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
