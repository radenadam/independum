# Logins in settings

- Status: accepted
- Date: 2026-10-26

## Context

Decision 0016 kept the Margin login screen for the first login and moved every later login into the settings dialog. That meant two designs for the same steps. The maintainer chose one flow for every login.

## Decision

- Every login happens in the Logins section of the settings dialog, the first one included.
- On the welcome screen, "Get started" opens the working screen with the Logins section open, and "Just look around" opens the working screen without it.
- Without a login, the Logins section opens on the providers, with a search and their logos. With logins, it lists them with a way to remove each, and "Add a login" opens the providers.
- Choosing a provider shows its sign-in options, then every step Pi asks for, such as a link to open, a device code, or a question, in the style of the working screen.
- The theme moves into the Appearance section, so the top bar of the welcome screen only shows where the user is.

## Consequences

- The Margin login screen and its components are removed. The welcome screen and the connection screens keep the look of decision 0009.
- The working screen works without a login. The model menu and Settings both lead to the Logins section.
- The rule of decision 0016 that the first login keeps the Margin style is replaced, and the login screen of decision 0008 becomes the Logins section.
