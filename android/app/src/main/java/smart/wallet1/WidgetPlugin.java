package smart.wallet1;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

@CapacitorPlugin(name = "WidgetPlugin")
public class WidgetPlugin extends Plugin {

    @PluginMethod
    public void setWidgetTheme(PluginCall call) {
        Boolean isDark = call.getBoolean("isDark", false);
        SharedPreferences prefs = getContext().getSharedPreferences("WidgetPrefs", Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putBoolean("widget_dark_mode", isDark);
        editor.apply();

        updateAllWidgets();
        call.resolve();
    }

    @PluginMethod
    public void syncWidgetData(PluginCall call) {
        String data = call.getString("data");
        if (data == null) {
            call.reject("Must provide data");
            return;
        }

        try {
            SharedPreferences prefs = getContext().getSharedPreferences("WidgetPrefs", Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();
            
            JSONObject json = new JSONObject(data);
            if (json.has("budget")) {
                editor.putString("budget_data", json.getJSONObject("budget").toString());
            }
            if (json.has("sts")) {
                editor.putString("sts_data", json.getJSONObject("sts").toString());
            }
            if (json.has("chart")) {
                editor.putString("chart_data", json.getJSONObject("chart").toString());
            }
            
            editor.apply();

            updateAllWidgets();
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to parse widget data: " + e.getMessage());
        }
    }

    private void updateAllWidgets() {
        Context context = getContext();
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        
        // Budget
        int[] budgetIds = appWidgetManager.getAppWidgetIds(new ComponentName(context, BudgetWidget.class));
        for (int id : budgetIds) {
            BudgetWidget.updateAppWidget(context, appWidgetManager, id);
        }

        // Chart
        int[] chartIds = appWidgetManager.getAppWidgetIds(new ComponentName(context, ChartWidget.class));
        for (int id : chartIds) {
            ChartWidget.updateAppWidget(context, appWidgetManager, id);
        }

        // STS
        int[] stsIds = appWidgetManager.getAppWidgetIds(new ComponentName(context, STSWidget.class));
        for (int id : stsIds) {
            STSWidget.updateAppWidget(context, appWidgetManager, id);
        }
    }
}
