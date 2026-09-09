# Password recovery setup

PLPass sends password-reset links through Supabase Auth. Before releasing this feature, configure the deployed application address in the Supabase dashboard.

1. Open **Authentication → URL Configuration** for the PLPass Supabase project.
2. Set **Site URL** to the deployed HTTPS address of PLPass.
3. Add `<deployed-PLPass-address>/reset-password` to **Redirect URLs**. Keep `http://localhost:5173/reset-password` for local development.
4. Open **Authentication → Email Templates → Reset Password** and set the sender name to `PLPass`.
5. Use a clear subject such as `Reset your PLPass password`. Keep Supabase's reset-link placeholder in the template so each email contains its one-time recovery link.
6. Send a reset request to a test school email, open the email link in a browser, set a new password, and sign in with it.

Never put a Supabase service-role key in the PLPass frontend or email template. The app only uses its public browser key for recovery and password changes.
