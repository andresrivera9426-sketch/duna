package co.duna.app;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;

import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    static volatile boolean visible;
    private static final int MAX_SHARE_BYTES = 25 * 1024 * 1024;

    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DunaNativePlugin.class);
        super.onCreate(savedInstanceState);
        // Si el motor del WebView se cae (poca memoria), se recarga DUNA en lugar de cerrar la app
        if (bridge != null) bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                runOnUiThread(MainActivity.this::recreate);
                return true;
            }
        });
        handle(getIntent());
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handle(intent);
    }
    @Override public void onResume() { super.onResume(); visible = true; }
    @Override public void onPause() { visible = false; super.onPause(); }

    private void handle(Intent i) {
        if (i == null) return;
        String chat = i.getStringExtra("duna_chat");
        if (chat != null) { DunaNativePlugin.emitOpen(chat, i.getStringExtra("duna_call")); i.removeExtra("duna_chat"); return; }
        String a = i.getAction();
        if (!Intent.ACTION_SEND.equals(a) && !Intent.ACTION_SEND_MULTIPLE.equals(a)) return;
        final Intent src = i;
        new Thread(() -> {
            JSObject s = new JSObject();
            String text = src.getStringExtra(Intent.EXTRA_TEXT);
            String subject = src.getStringExtra(Intent.EXTRA_SUBJECT);
            if (text != null) s.put("text", subject != null && !text.contains(subject) ? subject + "\n" + text : text);
            ArrayList<Uri> uris = new ArrayList<>();
            if (Intent.ACTION_SEND.equals(src.getAction())) { Uri u = src.getParcelableExtra(Intent.EXTRA_STREAM); if (u != null) uris.add(u); }
            else { ArrayList<Uri> l = src.getParcelableArrayListExtra(Intent.EXTRA_STREAM); if (l != null) uris.addAll(l); }
            JSArray files = new JSArray();
            int total = 0;
            for (Uri u : uris) {
                if (files.length() >= 10) break;
                try {
                    String name = "archivo", mime = getContentResolver().getType(u);
                    try (Cursor c = getContentResolver().query(u, null, null, null, null)) {
                        if (c != null && c.moveToFirst()) { int ix = c.getColumnIndex(OpenableColumns.DISPLAY_NAME); if (ix >= 0) name = c.getString(ix); }
                    }
                    try (InputStream in = getContentResolver().openInputStream(u)) {
                        ByteArrayOutputStream bo = new ByteArrayOutputStream();
                        byte[] buf = new byte[65536]; int n;
                        while ((n = in.read(buf)) > 0) { bo.write(buf, 0, n); if (total + bo.size() > MAX_SHARE_BYTES) throw new Exception("grande"); }
                        total += bo.size();
                        JSObject f = new JSObject();
                        f.put("name", name); f.put("mime", mime != null ? mime : "application/octet-stream");
                        f.put("data", Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP));
                        files.put(f);
                    }
                } catch (Exception e) { s.put("error", "Algún archivo es demasiado grande o no se pudo leer"); }
            }
            s.put("files", files);
            DunaNativePlugin.emitShare(s);
        }).start();
        src.setAction(Intent.ACTION_MAIN);
    }
}
