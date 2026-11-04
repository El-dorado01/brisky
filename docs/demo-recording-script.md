# Brisky demo recording script

Target about five minutes, with settings as an optional ending. This is a speaking
guide, not a set of expected model answers. Let Brisky answer in its own words.
Only describe a result after you have seen it work on screen. Keep your natural
pace; the text below is intentionally conversational.

## Before recording — do not read aloud

- Use the actual Brisky workspace, not the standalone synthetic runner. Check
  API/web health, Docker, Meta access, MMS readiness and your remaining budget.
- For indexing, use a folder containing a genuinely new short recording you are
  allowed to show. An already indexed duplicate may reuse existing knowledge and
  will not demonstrate the entire pipeline. Choose a short clip to keep the demo
  moving; the former 32 MiB source-file restriction has been removed.
- Confirm the worker is running for the indexing segment. Keep automatic polling
  off for this controlled recording. Do not purge your library just for the demo.
- Keep your existing kitchen, hippo and exam clips available for later searches.
  Review playback and whether their content is suitable to show publicly.
- Use a clean demo Space. Close unrelated tabs; hide account emails and private
  filenames where needed. Never show env files, OAuth secrets, API keys or inbox
  contents. You can cut away while receiving the login code.
- Test the microphone with headphones. Use the documented Meta dialogue + Gemini TTS exception profile for this take;
  do not substitute Gemini Live or hide which provider produces the speech.
- Rehearse once. If indexing takes longer than the video allows, show the real
  start and finish with an honest “Indexing wait shortened” cut. Never make a
  prerecorded or sped-up result appear live. Check the organizer's video limit.

## 1. Introduce Brisky and sign in — about 30 seconds

**On screen:** Login page. Enter your email, receive the code privately and sign in.

**Say:**

“Most of us have videos we remember, but finding the exact moment is another
story. Brisky lets me talk to my collection, find what I remember, and turn the
useful moments into something I can actually use.

“Brisky existed before this hackathon. What I built during the event is this
workspace and its Meta-powered conversation, voice, evidence and Studio features,
along with improvements to the original engine. Let me show you the actual flow.”

**While signing in:**

“I’ll sign in with an email code, then connect my own media.”

Do not narrate an onboarding sequence if the account has already completed it.

## 2. Connect and index — about 40 seconds, excluding actual processing wait

**On screen:** Factory → Connectors → your own Drive → Manage → select the new
test folder → Save & sync. Show queued work and the processing stages. Wait for
indexed status; open a stage detail briefly if useful.

**Say:**

“Here’s my connected Drive. I choose the folder Brisky can work with, then save
and sync it. Factory lets me see what’s happening instead of guessing whether
the video has been processed.

“The engine prepares the media, extracts useful visual and spoken information,
and makes that information searchable. Meta handles the model work in this
configuration, including the local search embeddings.”

**Only once indexing actually finishes:**

“That recording is indexed now. Let’s try talking to Brisky.”

If processing fails, show the real error and fix it before recording a clean
take. Do not call a queued or partially indexed recording fully indexed.

## 3. Voice conversation — about 60–90 seconds

**On screen:** Start Voice Mode from the workspace. Let the introduction modal
appear, enter the immersive call, and allow microphone access if requested.

**Say to the audience:**

“This is my favourite part. I can speak naturally, without turning every request
into a carefully written search query.”

**Say to Brisky, one turn at a time:**

1. “Hi Brisky. How are you doing?”
2. “Can you find the woman in a big hijab dancing in the kitchen?”
3. After the result is reported: “What can you tell me about that moment?”
4. “Thank you. That’s all for this call.”

Give each turn time to complete. Confirm Brisky actually reports the result;
do not talk over the result announcement just to fit the script. If you decide
to demonstrate interruption, interrupt once with a meaningful correction rather
than continually cutting off playback.

**After the call:**

“That call uses Meta speech recognition and reasoning, with Meta MMS speaking
the reply locally. Now I can inspect the source moment in the workspace.”

**On screen:** Select the citation and play a few seconds. Confirm the video and
timestamp match. Do not claim the local voice has Gemini Live's quality or that
response time is always instant.

## 4. Text reasoning with an imperfect memory — about 50 seconds

**On screen:** Use a fresh Space or clearly start a new collection-wide request.

**Type:**

> I remember a lady throwing something at a hippo. Can you find that moment?

**Say while it runs:**

“I don’t always remember every detail correctly. Brisky should help me find a
plausible moment, while being honest about what the recording actually shows.”

Read the actual reply. If it finds the watermelon clip and qualifies the
thrower's identity, point that out in your own words. Do not say it verified a
woman if only an arm is visible. Play the cited moment.

**Optional follow-up, if time allows:**

> What can you confirm from the clip, and what part of my description is uncertain?

**Say:**

“I can follow the answer back to its source, rather than just taking its word
for it. I’ll save this moment to my shortlist.”

**On screen:** Shortlist the selected moment. If no useful result appears, stop
and diagnose it; this script is not a reason to hide a failed answer.

## 5. Manual people tagging — about 35 seconds

**On screen:** Open a moment with a visible person, use Tag a person / Teach
Brisky this person, select or create an appropriate label, choose the visible
time range, and save. Use a person you can legitimately identify, or a neutral
label such as “Kitchen dancer.” Do not invent a real identity for the demo.

**Say:**

“Some knowledge is personal. Brisky won’t know who someone is just because they
appear in my video. Here I can give this person a label and attach it to the
moment where they’re visible.

“This is manual tagging. Automatic face matching is disabled in the hackathon
configuration, so I’m not claiming that naming someone identifies them across
every recording.”

**On screen:** Show the saved tag or person entry. Do not enable the old face
models or promise automatic recognition from the ‘Teach’ button.

## 6. Turn saved moments into a Studio creation — about 50–60 seconds

**On screen:** In a Space containing a suitable shortlist, open Space Studio.
Use the short creation route you have actually rehearsed. A brief is the safer
short demo; a storyline is an optional second creation, not a required extra call.

**Say:**

“Finding a moment is only the beginning. I can take the moments I’ve saved and
ask Studio to turn them into something useful.”

**Brief direction — type or paste:**

> Make a concise brief from these shortlisted moments. Explain what the recordings show, cite the supporting moments, and keep any suggested uses separate from the facts. Don't invent identities or details that aren't visible.

**Alternative storyline direction:**

> Build a short storyline from these shortlisted moments. Give it a clear beginning, middle and end. Cite the source for each beat, and label any creative connection that the footage itself does not establish.

Do not force unrelated videos into one factual sequence. If your shortlist is
unrelated, ask for a collection overview rather than implying one real event.

**Once the document exists:**

“Here’s the creation, with the source moments attached so I can check where the
details came from. I can keep it, revisit it, or export the document.”

**On screen:** Open one supporting citation, then show the actual save/export
action if available. Studio produces a document here, not a rendered video edit.

## 7. Optional settings and closing — about 20 seconds

**On screen:** Open settings from the sidebar user menu. Briefly show appearance,
text size and the active Meta voice option. Switch theme once if it works well
for your recording. The Gemini TTS exception enables the documented voice choices; MMS remains a
single-speaker option when that profile is selected.

**Say:**

“And I can make the workspace comfortable for me, including its appearance and
text size.

“That’s Brisky: find a moment, check the evidence, give it personal context, and
turn it into something useful—all through the workspace we built during this
hackathon.”

## Shorter take if the video limit is tight

Keep the same order. Use one voice search, one text search, one manual tag and
one Studio brief. Cut the optional follow-up, storyline alternative and settings.
Trim your narration before trimming the actual evidence that the features work.

## Recording checklist

- [ ] Visible login succeeds; no keys or inbox contents exposed.
- [ ] New-file Factory processing genuinely reaches indexed status.
- [ ] Voice acknowledges/reports a result; cited playback works.
- [ ] Text result distinguishes confirmed evidence from uncertain memory.
- [ ] Manual tag persists, without an automatic-recognition claim.
- [ ] Studio output exists and cites the chosen shortlist.
- [ ] Event work and pre-existing engine are attributed accurately.
- [ ] Any shortened waits are labelled; no staged model replies.
- [ ] Recording fits the organizer's actual duration and format requirements.
