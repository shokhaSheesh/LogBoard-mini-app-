# Mini app ideas

Things to add to the Brelo mini app, in rough order. Move an item to "Done" when it ships.

## Next

1. **Rate con on the load.** Attach the document (photo or PDF) to a load and view it later
   from the load's page. Needs a place to store the file on the backend first. Medium.
2. **Change password in the app.** A user on a temporary password has no way to change it
   from the phone today. Small.
3. **Billing: renew or change plan** from the plan card on Profile. Only worth it if owners
   pay from their phone. Larger.

## Telegram bot

How the bot works, decided 11.10.26: **what is done with the bot is done in Telegram**, by
typing in the group, not from buttons on the platform. The apps show the result.

The bot recognises whoever has signed in to the mini app (that ties a Telegram account to a
Brelo user). Drivers are not Brelo users, so the bot does not take commands from them.

Live:
- `/assign <driver name>` in a group connects it to that driver; `/assign` alone asks for
  the name. `/unassign` disconnects. One group per driver.
- Send to driver, from a load in the apps, posts the trip to that group.
- `/status` in the group changes the status of the driver's current load, or of the driver
  when they have none: `/status 123 enroute`, `/status enroute`, `/status HOME`, or
  `/status` alone to pick from a keyboard only the sender sees. Works as a reply to a trip
  message too. Only the current load can be changed; a queued one is refused. No
  confirmation, Completed included.

Next:
1. **Mark a stop done from the group** ("picked up", "delivered").
2. **Voice messages.** Speech turned into text and fed to the same commands. Start
   read-only ("where is Roberto?"). A change asked for by voice always shows what was
   understood and waits for a tap: a misheard digit costs money. Needs `GEMINI_API_KEY` on
   Render and a paid speech-to-text service.

## Smaller gaps against the web

- Drivers: reorder a driver's queue of next loads; pay history; CSV import.
- Equipment: CSV import.
- Payouts: custom date range (today there is a fixed list of periods).

## Decided against

- The full Board inside the Drivers tab.
- Rate con sent to the bot (decided 11.10.26). It was built and removed before shipping:
  the bot could only reply with a button into the mini app, where the form has to be
  checked and saved anyway, and the mini app's own "Have a rate confirmation?" already
  does the reading there. No benefit for an extra step.
- Notifications pushed by the bot on its own (reminders, alerts). The bot replying to
  something a person sent it is different, and is planned above.

## Done

- AI smart extract: fill a new load from a rate confirmation (photo, file or pasted text).
- Pull down to refresh.
- Send a load to the driver's Telegram group: add the bot to the group and type /assign with
  the driver's name there, then Send to driver on the load (web and mini app). Loads gained Ref #, PO #, Other #, and per
  stop a name, zip, PU/DEL #, pickup/delivery and appointment time zone.
