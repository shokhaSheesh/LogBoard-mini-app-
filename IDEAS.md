# Mini app ideas

Things to add to the Brelo mini app, in rough order. Move an item to "Done" when it ships.

## Next

1. **Send load details to the driver.** A Share button on a load that opens Telegram's own
   share sheet with the pickup, delivery, times and addresses as text. Needs no bot
   messaging. Small.
2. **Rate con on the load.** Attach the document (photo or PDF) to a load and view it later
   from the load's page. Needs a place to store the file on the backend first. Medium.
3. **Change password in the app.** A user on a temporary password has no way to change it
   from the phone today. Small.
4. **Billing: renew or change plan** from the plan card on Profile. Only worth it if owners
   pay from their phone. Larger.

## Telegram bot (planned, to start 11.10.26)

The bot becomes a second way into Brelo, not only the door to the mini app. Three features,
in the order to build them. All three sit on one shared base: the bot receiving messages,
knowing which Brelo user is talking (through the existing Telegram link), checking that
user's permissions, and recording "changed via Telegram by X".

1. **Rate con to the bot.** Send the bot a rate confirmation (PDF, photo or text) and it
   reads it with the existing AI extract. It does not save the load itself: it replies with
   what it read (broker, rate, route) and an "Open to review" button that opens the mini
   app form already filled in. Reason: the AI can misplace a stop or miss a time, and it
   can never know the driver. Small, and it proves the shared base.
2. **Commands in the driver's group.** The bot is added to the group with a driver, and
   short messages change the load: `#13131 completed`, a stop marked done, a status change.
   The most valuable of the three. Design points so far:
   - Only people whose Telegram is linked to a Brelo account that may update loads.
   - "Completed" writes the payout, so the bot asks first (Confirm / Cancel buttons).
     Lighter changes apply at once and offer Undo.
   - Tie each group to its driver once, so "picked up" / "delivered" work without the
     load number.
3. **Voice messages.** Speech turned into text and fed to the same commands as (2), so it
   comes after (2). Start read-only ("where is Roberto?"). A change asked for by voice
   always shows what was understood and waits for a tap: a misheard digit costs money.

Needs: `GEMINI_API_KEY` live on Render (1 and 3); the bot's privacy setting changed in
@BotFather so it can read group messages (2); a paid speech-to-text service (3).

Open questions, to settle before building:
- May drivers mark their own stops in the group, or dispatchers only? Drivers are not
  Brelo users today.
- One group per driver, or can a group hold several drivers?
- The exact words the bot understands, and what it replies (a command list for 2).
- Which statuses may be set from a group, and which need a confirm besides Completed.
- What the bot does with a message it doesn't understand: stay silent, or say so.
- For 1: private chat with the bot only, or also in groups?

## Smaller gaps against the web

- Drivers: reorder a driver's queue of next loads; pay history; CSV import.
- Equipment: CSV import.
- Payouts: custom date range (today there is a fixed list of periods).

## Decided against

- The full Board inside the Drivers tab.
- Notifications pushed by the bot on its own (reminders, alerts). The bot replying to
  something a person sent it is different, and is planned above.

## Done

- AI smart extract: fill a new load from a rate confirmation (photo, file or pasted text).
- Pull down to refresh.
