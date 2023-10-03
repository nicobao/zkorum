import { cryptoStore, store } from "../store/store";
import {
    verifying,
    authenticating,
    loggedOut,
    loggedIn,
    switchActiveSession,
    type SessionData,
} from "../store/reducers/session";
import * as DID from "../crypto/ucan/did/index";
import {
    DefaultApiFactory,
    type AuthAuthenticatePost200Response,
    type AuthVerifyOtpPost200Response,
    type AuthAuthenticatePost409Response,
} from "../api/api";
import {
    activeSessionUcanAxios,
    pendingSessionUcanAxios,
} from "../interceptors";
import axios from "axios";
import { showError, showSuccess } from "../store/reducers/snackbar";
import { authSuccess, genericError } from "../components/error/message";
import { closeMainLoading, openMainLoading } from "../store/reducers/loading";

export async function authenticate(
    email: string,
    isRequestingNewCode: boolean,
    userId?: string
): Promise<AuthAuthenticatePost200Response | "logged-in" | "awaiting-syncing"> {
    let didExchange: string;
    if (userId !== undefined) {
        const exchangeKeyExists =
            await cryptoStore.keystore.exchangeKeyExists(userId);
        if (exchangeKeyExists) {
            didExchange = await DID.exchange(cryptoStore, userId);
        } else {
            console.warn("UserId did not fetch any exchange key");
            await cryptoStore.keystore.createIfDoesNotExists(email);
            didExchange = await DID.exchange(cryptoStore, email);
        }
    } else {
        await cryptoStore.keystore.createIfDoesNotExists(email);
        didExchange = await DID.exchange(cryptoStore, email);
    }

    // this is a necessary step for interceptor to inject UCAN
    store.dispatch(authenticating({ email: email, userId: userId }));

    // Send authenticate request - UCAN will be sent by interceptor
    try {
        const otpDetails = await DefaultApiFactory(
            undefined,
            undefined,
            pendingSessionUcanAxios
        ).authAuthenticatePost({
            email: email,
            didExchange: didExchange,
            isRequestingNewCode: isRequestingNewCode,
        });
        store.dispatch(
            verifying({
                email: email,
                userId: userId,
                codeExpiry: otpDetails.data.codeExpiry,
                nextCodeSoonestTime: otpDetails.data.nextCodeSoonestTime,
            })
        );
        return otpDetails.data;
    } catch (e) {
        if (axios.isAxiosError(e)) {
            if (e.response?.status === 409) {
                const auth409: AuthAuthenticatePost409Response = e.response
                    .data as AuthAuthenticatePost409Response;
                if (auth409.reason === "already_logged_in") {
                    store.dispatch(
                        loggedIn({
                            email: email,
                            userId: auth409.userId,
                            isRegistration: false,
                            encryptedSymmKey: auth409.encryptedSymmKey,
                            syncingDevices: auth409.syncingDevices,
                            emailCredentialsPerEmail:
                                auth409.emailCredentialsPerEmail,
                            secretCredentialsPerType:
                                auth409.secretCredentialsPerType,
                        })
                    );
                    return "logged-in";
                } else {
                    // TODO
                    return "awaiting-syncing";
                }
            } else {
                console.log("outside", e);
                throw e;
            }
        } else {
            console.log(" more outside", e);
            throw e;
        }
    }
}

export async function verifyOtp(
    code: number,
    encryptedSymmKey: string
): Promise<AuthVerifyOtpPost200Response> {
    const verifyOtpResult = await DefaultApiFactory(
        undefined,
        undefined,
        pendingSessionUcanAxios
    ).authVerifyOtpPost({
        code: code,
        encryptedSymmKey: encryptedSymmKey,
    });
    return verifyOtpResult.data;
}

export async function logout() {
    const activeSessionEmail = store.getState().sessions.activeSessionEmail;
    await DefaultApiFactory(
        undefined,
        undefined,
        activeSessionUcanAxios
    ).authLogoutPost();
    store.dispatch(loggedOut({ email: activeSessionEmail }));
}

export function handleOnAuthenticate(email: string, userId?: string) {
    store.dispatch(openMainLoading());
    // do register the user
    authenticate(email, false, userId)
        .then((response) => {
            if (response === "logged-in") {
                store.dispatch(showSuccess(authSuccess));
            } else if (response === "awaiting-syncing") {
                // TODO
            }
            // else go to next step => validate email address => automatic via redux store update
        })
        .catch((e) => {
            console.error(e);
            store.dispatch(showError(genericError));
        })
        .finally(() => {
            store.dispatch(closeMainLoading());
        });
}

export function handleSwitchActiveSession(email: string) {
    store.dispatch(switchActiveSession({ email: email }));
    store.dispatch(showSuccess(`Switched active session to ${email}`));
}

export async function onChooseAccount(session: SessionData): Promise<void> {
    if (session.status === "logged-in") {
        handleSwitchActiveSession(session.email);
    } else {
        handleOnAuthenticate(session.email, session.userId);
    }
}
