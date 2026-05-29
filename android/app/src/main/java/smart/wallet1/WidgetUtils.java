package smart.wallet1;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;

public class WidgetUtils {

    public static Bitmap drawDonutChart(int size, float[] percentages, String[] colors) {
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(size * 0.15f); // Donut thickness

        RectF rect = new RectF(size * 0.1f, size * 0.1f, size * 0.9f, size * 0.9f);
        float startAngle = -90f;

        for (int i = 0; i < percentages.length; i++) {
            float sweepAngle = percentages[i] * 360f;
            paint.setColor(Color.parseColor(colors[i]));
            canvas.drawArc(rect, startAngle, sweepAngle, false, paint);
            startAngle += sweepAngle;
        }

        return bitmap;
    }
}
