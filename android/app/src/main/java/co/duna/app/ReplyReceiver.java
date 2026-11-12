package co.duna.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

import androidx.core.app.RemoteInput;

import org.json.JSONObject;

import java.util.UUID;
import java.util.concurrent.TimeUnit;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * "Responder" y "Marcar como leído" desde la notificación, sin abrir DUNA (funciona con la app cerrada).
 * En chats 1:1 la respuesta se cifra aquí con la clave del chat (E2E): el servidor solo recibe {v, iv, ct}.
 * Se autentica con el secreto de este dispositivo (guardado con el Keystore), no con la sesión del WebView.
 */
public class ReplyReceiver extends BroadcastReceiver {
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    private static final OkHttpClient http = new OkHttpClient.Builder().callTimeout(25, TimeUnit.SECONDS).build();

    @Override public void onReceive(Context c, Intent intent) {
        final String chat = intent.getStringExtra("chat");
        if (chat == null) return;
        final boolean reply = "co.duna.app.REPLY".equals(intent.getAction());
        String text = null;
        if (reply) {
            Bundle in = RemoteInput.getResultsFromIntent(intent);
            CharSequence cs = in == null ? null : in.getCharSequence(Notifier.KEY_REPLY);
            text = cs == null ? null : cs.toString().trim();
            if (text == null || text.isEmpty()) return;
            if (text.length() > 4000) text = text.substring(0, 4000);
        }
        final String msg = text;
        final String ct = intent.getStringExtra("ct");
        Notifier.ensureMeta(chat, intent.getStringExtra("title"), ct);
        final PendingResult pr = goAsync();
        final Context app = c.getApplicationContext();
        new Thread(() -> {
            try {
                if (reply) {
                    JSONObject args = base(app, chat);
                    if ("direct".equals(ct == null ? "direct" : ct)) {
                        String ck = Store.chatKey(app, chat);
                        if (ck == null) throw new IllegalStateException("abre DUNA una vez para preparar el cifrado de este chat");
                        args.put("p_enc", Sec.aesSeal(ck, new JSONObject().put("b", msg).put("m", JSONObject.NULL).put("t", JSONObject.NULL).toString()));
                    } else args.put("p_body", msg);
                    args.put("p_client_id", UUID.randomUUID().toString());
                    rpc(app, "native_reply", args);
                    Notifier.addMyReply(app, chat, msg);
                } else {
                    rpc(app, "native_mark_read", base(app, chat));
                    Notifier.clearChat(app, chat);
                }
            } catch (Exception e) {
                String why = e.getMessage() == null ? "sin conexión" : e.getMessage();
                if (why.length() > 120) why = why.substring(0, 120);
                if (reply) Notifier.replyFailed(app, chat, why);
            } finally { pr.finish(); }
        }).start();
    }

    private static JSONObject base(Context c, String chat) throws Exception {
        String topic = Store.topic(c), secret = Store.reply(c);
        if (topic == null || secret == null) throw new IllegalStateException("abre DUNA para activar las respuestas rápidas");
        return new JSONObject().put("p_topic", topic).put("p_secret", secret).put("p_chat", chat);
    }

    private static void rpc(Context c, String fn, JSONObject args) throws Exception {
        String url = Store.url(c), key = Store.apikey(c);
        if (url == null || key == null) throw new IllegalStateException("sesión no configurada");
        Request rq = new Request.Builder().url(url + "/rest/v1/rpc/" + fn)
                .header("apikey", key).header("Authorization", "Bearer " + key)
                .post(RequestBody.create(args.toString(), JSON)).build();
        try (Response r = http.newCall(rq).execute()) {
            if (!r.isSuccessful()) {
                String b = r.body() == null ? "" : r.body().string();
                String m = "error " + r.code();
                try { m = new JSONObject(b).optString("message", m); } catch (Exception ignored) { }
                throw new IllegalStateException(m);
            }
        }
    }
}
