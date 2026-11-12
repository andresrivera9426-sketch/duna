package co.duna.app;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Cifrado local: las claves de DUNA se guardan envueltas con una clave del Android Keystore (no exportable). */
final class Sec {
    private static final String ALIAS = "duna_local_v1";

    private static SecretKey keystoreKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (!ks.containsAlias(ALIAS)) {
            KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            g.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256).build());
            return g.generateKey();
        }
        return (SecretKey) ks.getKey(ALIAS, null);
    }

    static String wrap(String plain) {
        if (plain == null) return null;
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, keystoreKey());
            byte[] iv = c.getIV();
            byte[] ct = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            byte[] out = new byte[iv.length + ct.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(ct, 0, out, iv.length, ct.length);
            return Base64.encodeToString(out, Base64.NO_WRAP);
        } catch (Exception e) { return null; }
    }

    static String unwrap(String b64) {
        if (b64 == null) return null;
        try {
            byte[] all = Base64.decode(b64, Base64.NO_WRAP);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, keystoreKey(), new GCMParameterSpec(128, Arrays.copyOfRange(all, 0, 12)));
            return new String(c.doFinal(Arrays.copyOfRange(all, 12, all.length)), StandardCharsets.UTF_8);
        } catch (Exception e) { return null; }
    }

    static byte[] b64(String s) {
        s = s.replace('-', '+').replace('_', '/');
        while (s.length() % 4 != 0) s += "=";
        return Base64.decode(s, Base64.NO_WRAP);
    }

    /** AES-256-GCM con iv/ct en base64 (formato de la función push y del cifrado E2E de DUNA). */
    /** Cifra igual que la web (encJSON): AES-GCM, iv de 12 bytes, devuelve {v:1, iv, ct} en base64. */
    static org.json.JSONObject aesSeal(String keyB64, String plain) throws Exception {
        byte[] iv = new byte[12]; new java.security.SecureRandom().nextBytes(iv);
        Cipher cph = Cipher.getInstance("AES/GCM/NoPadding");
        cph.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(Base64.decode(keyB64, Base64.NO_WRAP), "AES"), new GCMParameterSpec(128, iv));
        byte[] ct = cph.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        return new org.json.JSONObject().put("v", 1).put("iv", Base64.encodeToString(iv, Base64.NO_WRAP)).put("ct", Base64.encodeToString(ct, Base64.NO_WRAP));
    }

    static String aesOpen(String keyB64, String ivB64, String ctB64) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(b64(keyB64), "AES"), new GCMParameterSpec(128, b64(ivB64)));
        return new String(c.doFinal(b64(ctB64)), StandardCharsets.UTF_8);
    }
}
