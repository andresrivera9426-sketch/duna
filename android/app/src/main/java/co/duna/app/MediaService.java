package co.duna.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

/**
 * DUNA Radio en segundo plano: servicio en primer plano (tipo mediaPlayback) que mantiene viva la app
 * mientras suena una emisora, con una notificación para volver a DUNA o detener la radio.
 * El audio lo reproduce la propia vista web; este servicio solo evita que Android la suspenda.
 */
public class MediaService extends Service {
    static final String CH = "duna_media";
    static final String STOP = "co.duna.app.MEDIA_STOP";
    static boolean running = false;
    private PowerManager.WakeLock lock;

    static void start(Context c, String title, String sub) {
        Intent i = new Intent(c, MediaService.class).putExtra("title", title).putExtra("sub", sub);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }
    static void stop(Context c) { c.stopService(new Intent(c, MediaService.class)); }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && STOP.equals(intent.getAction())) { DunaNativePlugin.emitMediaStop(); stopSelf(); return START_NOT_STICKY; }
        String title = intent != null && intent.getStringExtra("title") != null ? intent.getStringExtra("title") : "DUNA Radio";
        String sub = intent != null && intent.getStringExtra("sub") != null ? intent.getStringExtra("sub") : "En vivo";
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            NotificationChannel ch = new NotificationChannel(CH, "Radio y audio", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Control de la radio mientras suena en segundo plano"); ch.setShowBadge(false); ch.setSound(null, null);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent po = PendingIntent.getActivity(this, 7001, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent ps = PendingIntent.getService(this, 7002, new Intent(this, MediaService.class).setAction(STOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new NotificationCompat.Builder(this, CH).setSmallIcon(R.drawable.ic_stat_duna).setColor(0xFF3B2FD6)
                .setContentTitle(title).setContentText(sub).setSubText("DUNA Radio").setContentIntent(po).setOngoing(true).setSilent(true)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT).setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .addAction(0, "Detener", ps).build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(7000, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK); else startForeground(7000, n);
        if (lock == null) { PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE); lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "duna:radio"); lock.setReferenceCounted(false); }
        if (!lock.isHeld()) lock.acquire(4 * 60 * 60 * 1000L); // máximo 4 h, por la batería
        running = true;
        return START_NOT_STICKY;
    }
    @Override public void onDestroy() { running = false; if (lock != null && lock.isHeld()) lock.release(); super.onDestroy(); }
    @Override public void onTaskRemoved(Intent rootIntent) { stopSelf(); super.onTaskRemoved(rootIntent); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
