package co.duna.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/**
 * Vía de respaldo sin terceros (cuando no hay FCM): servicio en primer plano que mantiene un websocket
 * con Supabase Realtime (protocolo Phoenix) unido al topic secreto del dispositivo. Al reconectar,
 * recupera de la cola lo que llegó mientras no había red.
 */
public class PushService extends Service {
    private static final long HEARTBEAT_MS = 25000;
    private final Handler h = new Handler(Looper.getMainLooper());
    private OkHttpClient http;
    private WebSocket ws;
    private boolean joined;
    private int ref = 0;
    private String joinRef;
    private long lastRx = 0, backoff = 2000;
    private PowerManager.WakeLock wl;
    private ConnectivityManager.NetworkCallback netCb;
    static volatile boolean running;
    static volatile boolean connected;

    static void start(Context c) {
        Intent i = new Intent(c, PushService.class);
        try { ContextCompat.startForegroundService(c, i); } catch (Exception ignored) { }
    }
    static void stop(Context c) { c.stopService(new Intent(c, PushService.class)); }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public void onCreate() {
        super.onCreate();
        running = true;
        Notifier.channels(this);
        Notification n = new NotificationCompat.Builder(this, Notifier.CH_SERVICE)
                .setSmallIcon(R.drawable.ic_stat_duna).setColor(0xFF6D4BFF)
                .setContentTitle("DUNA está lista para recibir mensajes")
                .setContentText("Toca para abrir · puedes ocultar este aviso en Ajustes")
                .setPriority(NotificationCompat.PRIORITY_MIN).setOngoing(true).setShowWhen(false)
                .setContentIntent(Notifier.openIntent(this, null, null, 1)).build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING);
        else startForeground(1, n);
        http = new OkHttpClient.Builder().readTimeout(0, TimeUnit.MILLISECONDS).connectTimeout(15, TimeUnit.SECONDS).build();
        // La CPU debe poder enviar el latido aunque la pantalla esté apagada (si no, el servidor corta el socket)
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "duna:push");
        wl.setReferenceCounted(false);
        wl.acquire();
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        netCb = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network n) { h.post(() -> reconnect(300)); }
        };
        try { cm.registerDefaultNetworkCallback(netCb); } catch (Exception ignored) { }
        h.postDelayed(beat, HEARTBEAT_MS);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (!Store.registered(this) || Store.fcmMode(this)) { stopSelf(); return START_NOT_STICKY; }
        if (ws == null) connect();
        else if (!joined || SystemClock.elapsedRealtime() - lastRx > 2 * HEARTBEAT_MS + 10000) reconnect(0);
        scheduleWatchdog();
        return START_STICKY;
    }

    /** Vigilante: cada 15 min (también en reposo) revisa la conexión. */
    private void scheduleWatchdog() {
        AlarmManager am = (AlarmManager) getSystemService(ALARM_SERVICE);
        Intent si = new Intent(this, PushService.class);
        int fl = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = Build.VERSION.SDK_INT >= 26 ? PendingIntent.getForegroundService(this, 9, si, fl) : PendingIntent.getService(this, 9, si, fl);
        long at = SystemClock.elapsedRealtime() + 15 * 60 * 1000;
        if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi);
        else am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi);
    }

    private final Runnable beat = new Runnable() {
        @Override public void run() {
            if (ws != null && joined) {
                if (SystemClock.elapsedRealtime() - lastRx > 2 * HEARTBEAT_MS + 10000) reconnect(0);
                else send("phoenix", "heartbeat", new JSONObject(), null);
            }
            h.postDelayed(this, HEARTBEAT_MS);
        }
    };

    private String nextRef() { return String.valueOf(++ref); }

    private void send(String topic, String event, JSONObject payload, String jr) {
        try {
            JSONObject m = new JSONObject().put("topic", topic).put("event", event).put("payload", payload).put("ref", nextRef());
            if (jr != null) m.put("join_ref", jr);
            if (ws != null) ws.send(m.toString());
        } catch (Exception ignored) { }
    }

    private void connect() {
        String url = Store.url(this), apikey = Store.apikey(this);
        if (url == null || apikey == null) return;
        String wsUrl = url.replaceFirst("^http", "ws") + "/realtime/v1/websocket?apikey=" + apikey + "&vsn=1.0.0";
        joined = false; connected = false;
        ws = http.newWebSocket(new Request.Builder().url(wsUrl).build(), new WebSocketListener() {
            @Override public void onOpen(WebSocket s, Response r) {
                if (s != ws) return;
                lastRx = SystemClock.elapsedRealtime();
                try {
                    JSONObject cfg = new JSONObject()
                            .put("broadcast", new JSONObject().put("ack", false).put("self", false))
                            .put("presence", new JSONObject().put("key", "")).put("postgres_changes", new JSONArray()).put("private", false);
                    joinRef = nextRef();
                    JSONObject m = new JSONObject().put("topic", "realtime:duna-push:" + Store.topic(PushService.this)).put("event", "phx_join")
                            .put("payload", new JSONObject().put("config", cfg)).put("ref", joinRef).put("join_ref", joinRef);
                    s.send(m.toString());
                } catch (Exception ignored) { }
            }
            @Override public void onMessage(WebSocket s, String text) {
                if (s != ws) return;
                lastRx = SystemClock.elapsedRealtime();
                try {
                    JSONObject m = new JSONObject(text);
                    String ev = m.optString("event");
                    if ("phx_reply".equals(ev) && joinRef != null && joinRef.equals(m.optString("ref"))) {
                        boolean ok = "ok".equals(m.optJSONObject("payload") != null ? m.getJSONObject("payload").optString("status") : "");
                        if (ok) { joined = true; connected = true; backoff = 2000; fetchPending(); }
                        else h.post(() -> reconnect(backoff));
                    } else if ("broadcast".equals(ev)) {
                        JSONObject p = m.getJSONObject("payload").optJSONObject("payload");
                        if (p != null) Notifier.handle(PushService.this, p.optLong("id"), p.optString("iv", null), p.optString("ct", null));
                    } else if ("phx_error".equals(ev) || "phx_close".equals(ev)) {
                        h.post(() -> reconnect(backoff));
                    }
                } catch (Exception ignored) { }
            }
            @Override public void onFailure(WebSocket s, Throwable t, Response r) { if (s == ws) h.post(() -> reconnect(backoff)); }
            @Override public void onClosed(WebSocket s, int code, String reason) { if (s == ws) h.post(() -> reconnect(backoff)); }
        });
    }

    private void reconnect(long delay) {
        h.removeCallbacks(doConnect);
        if (ws != null) { WebSocket old = ws; ws = null; try { old.cancel(); } catch (Exception ignored) { } }
        joined = false; connected = false;
        backoff = Math.min(backoff * 2, 60000);
        h.postDelayed(doConnect, delay);
    }
    private final Runnable doConnect = () -> { if (ws == null && Store.registered(this)) connect(); };

    /** Recupera notificaciones guardadas en la cola que no llegaron en vivo. */
    private void fetchPending() {
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject().put("p_topic", Store.topic(this)).put("p_after", Math.max(0, Store.lastId(this) - 200));
                Request rq = new Request.Builder().url(Store.url(this) + "/rest/v1/rpc/native_pending")
                        .header("apikey", Store.apikey(this)).header("Content-Type", "application/json")
                        .post(RequestBody.create(body.toString(), MediaType.get("application/json"))).build();
                try (Response r = http.newCall(rq).execute()) {
                    if (!r.isSuccessful() || r.body() == null) return;
                    JSONArray a = new JSONArray(r.body().string());
                    for (int i = 0; i < a.length(); i++) {
                        JSONObject row = a.getJSONObject(i), d = row.getJSONObject("data");
                        Notifier.handle(this, row.getLong("id"), d.optString("iv", null), d.optString("ct", null));
                    }
                }
            } catch (Exception ignored) { }
        }).start();
    }

    @Override public void onDestroy() {
        running = false; connected = false;
        h.removeCallbacksAndMessages(null);
        if (ws != null) { try { ws.close(1000, "fin"); } catch (Exception ignored) { } ws = null; }
        try { ((ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE)).unregisterNetworkCallback(netCb); } catch (Exception ignored) { }
        if (wl != null && wl.isHeld()) wl.release();
        super.onDestroy();
    }
}
