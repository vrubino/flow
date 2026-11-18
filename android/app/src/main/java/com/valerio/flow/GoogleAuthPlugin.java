package com.valerio.flow;

import android.app.Activity;
import android.app.PendingIntent;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import java.util.ArrayList;
import java.util.List;

/**
 * Minimal Google authorization for Flow.
 * Uses Google Play services' AuthorizationClient (the recommended way to get
 * access tokens for Google APIs on Android). Returns a short-lived OAuth access
 * token for the requested scopes; Play services caches and refreshes it.
 */
@CapacitorPlugin(name = "GoogleAuth")
public class GoogleAuthPlugin extends Plugin {

    private ActivityResultLauncher<IntentSenderRequest> consentLauncher;
    private String pendingCallId = null;

    @Override
    public void load() {
        consentLauncher = bridge.registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            this::onConsentResult
        );
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        List<Scope> scopes = new ArrayList<>();
        try {
            JSArray arr = call.getArray("scopes", new JSArray());
            List<Object> raw = arr.toList();
            for (Object s : raw) scopes.add(new Scope(String.valueOf(s)));
        } catch (Exception e) {
            call.reject("Invalid scopes", "bad_request");
            return;
        }
        if (scopes.isEmpty()) {
            call.reject("No scopes requested", "bad_request");
            return;
        }
        final boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", true));
        AuthorizationRequest request = AuthorizationRequest.builder().setRequestedScopes(scopes).build();
        Identity.getAuthorizationClient(getActivity())
            .authorize(request)
            .addOnSuccessListener(result -> {
                if (result.hasResolution()) {
                    if (!interactive) {
                        call.reject("User consent required", "consent_required");
                        return;
                    }
                    PendingIntent pi = result.getPendingIntent();
                    if (pi == null) {
                        call.reject("No consent screen available", "auth_failed");
                        return;
                    }
                    bridge.saveCall(call);
                    pendingCallId = call.getCallbackId();
                    try {
                        consentLauncher.launch(new IntentSenderRequest.Builder(pi.getIntentSender()).build());
                    } catch (Exception e) {
                        pendingCallId = null;
                        bridge.releaseCall(call);
                        call.reject("Could not open the Google consent screen: " + e.getMessage(), "auth_failed");
                    }
                } else {
                    resolveWith(call, result);
                }
            })
            .addOnFailureListener(e -> call.reject("Google authorization failed: " + e.getMessage(), "auth_failed"));
    }

    private void onConsentResult(ActivityResult activityResult) {
        if (pendingCallId == null) return;
        PluginCall call = bridge.getSavedCall(pendingCallId);
        pendingCallId = null;
        if (call == null) return;
        bridge.releaseCall(call);
        if (activityResult.getResultCode() != Activity.RESULT_OK) {
            call.reject("Sign-in cancelled", "cancelled");
            return;
        }
        try {
            AuthorizationResult result = Identity.getAuthorizationClient(getActivity())
                .getAuthorizationResultFromIntent(activityResult.getData());
            resolveWith(call, result);
        } catch (ApiException e) {
            call.reject("Google authorization failed: " + e.getStatusCode(), "auth_failed");
        }
    }

    private void resolveWith(PluginCall call, AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null) {
            call.reject("No access token returned", "auth_failed");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("accessToken", token);
        JSArray granted = new JSArray();
        for (String s : result.getGrantedScopes()) granted.put(s);
        ret.put("grantedScopes", granted);
        call.resolve(ret);
    }
}
