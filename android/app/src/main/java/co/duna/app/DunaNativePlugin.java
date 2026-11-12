package co.duna.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

/** Puente JS ↔ Android de DUNA: registro de notificaciones, permisos, claves de vista previa y compartir. */
@CapacitorPlugin(name = "DunaNative", permissions = {
        @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
})
public class DunaNativePlugin extends Plugin {
    private static DunaNativePlugin inst;
    static JSObject pendingShare;
    static String pendingChat, pendingCall;

    @Override public void load() { inst = this; Notifier.channels(getContext()); }

    static void emitOpen(String chat, String call) {
        pendingChat = chat; pendingCall = call;
        if (inst != null && chat != null) {
            JSObject o = new JSObject(); o.put("chat", chat); if (call != null) o.put("call", call);
            inst.notifyListeners("open", o, true);
        }
    }
    static void emitShare(JSObject s) {
        pendingShare = s;
        if (inst != null) inst.notifyListeners("share", new JSObject(), true);
    }
    static void emitToken(String token) {
        if (inst != null) { JSObject o = new JSObject(); o.put("token", token); inst.notifyListeners("fcmToken", o, true); }
    }

    private boolean notifGranted() { return NotificationManagerCompat.from(getContext()).areNotificationsEnabled(); }
    private boolean batteryExempt() {
        if (Build.VERSION.SDK_INT < 23) return true;
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }
    // Solo FCM cuando hay token y el servidor ya puede enviar por FCM; si no, sigue la conexión propia
    private boolean useFcm() { return BuildConfig.HAS_FCM && Store.p(getContext()).getBoolean("fcm_ready", false) && Store.p(getContext()).getString("fcm_token", null) != null; }

    @PluginMethod public void info(PluginCall call) {
        JSObject o = new JSObject();
        o.put("hasFcm", BuildConfig.HAS_FCM);
        o.put("fcm", useFcm());
        o.put("notifications", notifGranted());
        o.put("battery", batteryExempt());
        o.put("registered", Store.registered(getContext()));
        o.put("service", PushService.running);
        o.put("connected", PushService.connected);
        o.put("sdk", Build.VERSION.SDK_INT);
        o.put("version", BuildConfig.VERSION_NAME);
        o.put("brand", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase(java.util.Locale.ROOT));
        o.put("reply", Store.reply(getContext()) != null);
        call.resolve(o);
    }

    /** Guarda topic + clave del dispositivo y arranca la vía activa (FCM o conexión propia). */
    @PluginMethod public void register(PluginCall call) {
        String url = call.getString("url"), apikey = call.getString("apikey"), topic = call.getString("topic"), key = call.getString("key"), uid = call.getString("uid");
        if (url == null || apikey == null || topic == null || key == null) { call.reject("faltan datos"); return; }
        Store.save(getContext(), url, apikey, topic, key, uid);
        Store.setReply(getContext(), call.getString("reply"));
        Store.p(getContext()).edit().putBoolean("fcm_ready", Boolean.TRUE.equals(call.getBoolean("fcmReady", false))).apply();
        applyMode();
        call.resolve();
    }
    private void applyMode() {
        if (!Store.registered(getContext())) return;
        if (useFcm()) PushService.stop(getContext()); else PushService.start(getContext());
    }

    @PluginMethod public void fcmToken(PluginCall call) {
        if (!BuildConfig.HAS_FCM) { call.resolve(new JSObject()); return; }
        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken().addOnCompleteListener(t -> {
                JSObject o = new JSObject();
                if (t.isSuccessful() && t.getResult() != null) {
                    Store.p(getContext()).edit().putString("fcm_token", t.getResult()).apply();
                    o.put("token", t.getResult());
                } else o.put("error", t.getException() != null ? t.getException().getMessage() : "sin token");
                applyMode();
                call.resolve(o);
            });
        } catch (Exception e) { JSObject o = new JSObject(); o.put("error", e.getMessage()); call.resolve(o); }
    }

    @PluginMethod public void unregister(PluginCall call) {
        PushService.stop(getContext());
        Store.clear(getContext());
        NotificationManagerCompat.from(getContext()).cancelAll();
        if (BuildConfig.HAS_FCM) { try { com.google.firebase.messaging.FirebaseMessaging.getInstance().deleteToken(); } catch (Exception ignored) { } }
        call.resolve();
    }

    @PluginMethod public void setChatKeys(PluginCall call) {
        JSObject keys = call.getObject("keys", new JSObject());
        Store.setChatKeys(getContext(), keys, Boolean.TRUE.equals(call.getBoolean("preview", true)));
        call.resolve();
    }

    @PluginMethod public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notifPermCb");
        } else {
            if (!notifGranted()) openNotifSettings();
            JSObject o = new JSObject(); o.put("granted", notifGranted()); call.resolve(o);
        }
    }
    @PermissionCallback private void notifPermCb(PluginCall call) {
        JSObject o = new JSObject(); o.put("granted", notifGranted()); call.resolve(o);
    }
    private void openNotifSettings() {
        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { getContext().startActivity(i); } catch (Exception ignored) { }
    }
    @PluginMethod public void openSettings(PluginCall call) { openNotifSettings(); call.resolve(); }

    /** Pide no restringir la batería (necesario solo para la vía propia sin FCM). */
    @PluginMethod public void requestBattery(PluginCall call) {
        if (!batteryExempt() && Build.VERSION.SDK_INT >= 23) {
            // Lista general de optimización de batería (no requiere el permiso REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
            Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try { getContext().startActivity(i); } catch (Exception e) { call.reject(e.getMessage()); return; }
        }
        call.resolve();
    }

    /** Abre la ficha de DUNA en Ajustes (batería, inicio automático, notificaciones): sin tocar apps de terceros. */
    @PluginMethod public void openAutostart(PluginCall call) {
        try {
            getContext().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception ignored) { }
        JSObject o = new JSObject(); o.put("opened", "app_details"); call.resolve(o);
    }

    @PluginMethod public void clearChat(PluginCall call) {
        String chat = call.getString("chat");
        if (chat != null) Notifier.clearChat(getContext(), chat);
        call.resolve();
    }
    @PluginMethod public void testNotification(PluginCall call) { Notifier.test(getContext()); call.resolve(); }

    @PluginMethod public void takeOpen(PluginCall call) {
        JSObject o = new JSObject();
        if (pendingChat != null) { o.put("chat", pendingChat); if (pendingCall != null) o.put("call", pendingCall); }
        pendingChat = null; pendingCall = null;
        call.resolve(o);
    }
    @PluginMethod public void takeShare(PluginCall call) {
        JSObject o = pendingShare != null ? pendingShare : new JSObject();
        pendingShare = null;
        call.resolve(o);
    }

    static JSONObject unused() { return null; }
}
