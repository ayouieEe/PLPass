# Password recovery setup

PLPass sends password-reset links through Supabase Auth. Before releasing this feature, configure the deployed application address in the Supabase dashboard.

1. Open **Authentication → URL Configuration** for the PLPass Supabase project.
2. Set **Site URL** to the deployed HTTPS address of PLPass.
3. Add `<deployed-PLPass-address>/reset-password` to **Redirect URLs** for password resets, and add `<deployed-PLPass-address>/accept-invitation` for account invitations. Keep both localhost URLs for local development.
4. Open **Authentication → Email Templates → Reset Password** and set the sender name to `PLPass`.
5. Open **Authentication → Email Templates → Invite user** and use invitation wording such as `You've been invited` with Supabase's invitation-link placeholder.
6. Use a clear reset subject such as `Reset your PLPass password`, and test both flows separately in a browser.

Never put a Supabase service-role key in the PLPass frontend or email template. The app only uses its public browser key for recovery and password changes.
