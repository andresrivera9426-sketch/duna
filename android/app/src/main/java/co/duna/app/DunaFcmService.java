package co.duna.app;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/** Vía principal cuando existe google-services.json: FCM (mensajes "data" de prioridad alta, cifrados). */
public class DunaFcmService extends FirebaseMessagingService {
    @Override public void onMessageReceived(@NonNull RemoteMessage msg) {
        Map<String, String> d = msg.getData();
        long id = 0; try { id = Long.parseLong(d.get("id")); } catch (Exception ignored) { }
        Notifier.handle(this, id, d.get("iv"), d.get("ct"));
    }
    @Override public void onNewToken(@NonNull String token) {
        Store.p(this).edit().putString("fcm_token", token).putBoolean("fcm_dirty", true).apply();
        DunaNativePlugin.emitToken(token);
    }
}
