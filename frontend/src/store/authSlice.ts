import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
};

const initialState: AuthState = {
  user: null,
  accessToken: null,
};

// Access token only. The refresh token is an HttpOnly cookie, so a reload can restore the session.
const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setAccessToken(state, action: PayloadAction<string>) {
      state.accessToken = action.payload;
    },
    setUser(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload;
    },
    clearSession(state) {
      state.user = null;
      state.accessToken = null;
    },
  },
});

export const { setAccessToken, setUser, clearSession } = authSlice.actions;
export default authSlice.reducer;
