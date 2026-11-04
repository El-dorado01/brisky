Viewed intelligence-merger.service.ts:100-145

You are asking the exact question that separates a toy search system from a **true multimodal intelligence platform**.

When you move beyond structured medical lectures to **TikToks, YouTube Shorts, football highlights, gaming, casual vlogs, and podcasts**, the nature of media changes completely:

---

### The 4 Real-World Content Archetypes & Their Traps

```mermaid
flowchart TD
    subgraph A [1. Sports & Action e.g. Football]
        A1["Speech: 'What a strike! Unbelievable!'"]
        A2["Visual: Bicycle kick into top corner, yellow card"]
        A3["User Query: 'slide tackle in the rain'"]
        A4["⚠️ Trap: Zero mention in speech! Signal is 100% visual."]
    end

    subgraph B [2. TikTok / Reels / Shorts]
        B1["Speech: Trending sound / meme music"]
        B2["Visual: Cooking recipe, prank, dance"]
        B3["On-Screen (OCR): 'Wait till the end 😭'"]
        B4["⚠️ Trap: Audio is misleading noise. The real data is in OCR + visual action."]
    end

    subgraph C [3. Casual Podcasts / Vlogs]
        C1["Speech: 2 hours of rambling banter & jokes"]
        C2["Visual: Two people sitting with mics"]
        C3["User Query: 'when did they talk about buying a car?'"]
        C4["⚠️ Trap: Visual is static. Signal is 100% spoken cues."]
    end

    subgraph D [4. Proper Nouns / Names / Memes]
        D1["Query: 'Mbappé', 'RTX 4090', 'iPhone 16'"]
        D2["⚠️ Trap: Vectors are blurry for proper nouns; exact lexical OCR/Speech wins."]
    end
```

---

### Why a Naive Approach (or Hard Thresholds) Fails on These Edge Cases

#### Edge Case 1: The "Visual-Only Action" in Sports
- **User searches:** `"red card tackle"` in a football clip.
- The commentator screams: *"And the referee is over there, tempers are flaring!"*
- If the system relies primarily on speech, it finds **nothing**.
- But in [intelligence-merger.service.ts](file:///c:/Users/hp/Desktop/brisky/apps/api/src/modules/pipeline/intelligence-merger.service.ts), our pipeline extracts `actions: ['tackle', 'foul', 'referee pulling card']` and `objects: ['soccer ball', 'referee', 'whistle']`.
- **Trap of a hard threshold (e.g. 0.70):** The text `"red card tackle"` compared against `"referee holds up card after player collision"` might score **0.62** cosine similarity. A rigid 0.70 cutoff would discard the exact clip the user wanted!

#### Edge Case 2: The TikTok / Shorts Meme Music Trap
- Many shorts use trending audio tracks (e.g., viral TikTok sounds, random electronic beats). The transcript is either empty, gibberish, or completely unrelated to what is happening on screen (e.g., a recipe video with a comedy audio track).
- If the user searches: `"pasta carbonara recipe"`, the speech track has zero mention of pasta, but the **OCR on-screen text** and **visual frame objects** (`['frying pan', 'eggs', 'bacon']`) have everything.

#### Edge Case 3: The "Modality Intent" Collision
- **Query 1:** *"Show me someone wearing a red hoodie"* $\to$ **Visual Intent** (user wants to *see* it).
- **Query 2:** *"What did they say about the red hoodie?"* $\to$ **Speech Intent** (user wants to *hear* what was said).
- If the search engine treats all text as one flat soup, it cannot prioritize the right stream.

---

### The Ultimate Robust Approach: Intent-Aware Multimodal Search

Rather than a single rigid cutoff or relying solely on speech, here is the best, battle-tested architecture:

#### 1. Zero-Cost Modality Routing (Visual vs Spoken vs Generic)
Before running the search, a lightweight rule checks the phrasing:
- **Visual cues** (*"wearing"*, *"holding"*, *"car"*, *"red"*, *"looking"*, *"scene with"*, *"tackle"*) $\to$ Gives high weight to `visual_objects`, `actions`, and `keyframes`.
- **Spoken cues** (*"mentioned"*, *"said"*, *"talked about"*, *"any mention of"*) $\to$ Gives high weight to `transcript_text` from `faster-whisper`.
- **Conceptual/Topic queries** (*"respiratory pharmacology"*, *"Bellingham goal"*, *"how to bake sourdough"*) $\to$ Runs full multimodal fusion across all signals.

#### 2. Weighted Cross-Modal Field Scoring
In PostgreSQL, our `doc_vector` already merges all signals. We weight them dynamically:
```sql
setweight(to_tsvector('simple', coalesce(s.title, '')), 'A') ||
setweight(to_tsvector('simple', coalesce(s.on_screen_text, '')), 'A') || -- Crucial for TikTok/Shorts!
setweight(to_tsvector('simple', coalesce(s.transcript_text, '')), 'B') || -- Spoken cues
setweight(to_tsvector('simple', array_to_string(s.actions, ' ')), 'B') || -- Sports / Action
setweight(to_tsvector('simple', array_to_string(s.visual_objects, ' ')), 'C')
```

#### 3. Dynamic Relative Thresholding (Not Rigid Cutoffs)
Instead of an arbitrary static threshold like `0.70`:
- **For exact phrases / names (e.g. "Mbappé", "anti-cancer", "albuterol"):** Use exact word boundary matching (`\yword\y`). If it exists, it is an automatic 100% match.
- **For vector similarity:**
  - Rank results by distance.
  - Calculate the **confidence gap**: If the top result is `0.68` and the second is `0.45`, the top result is a sharp, distinct match.
  - If all results cluster tightly around `0.42 - 0.44` (like the antihistamines example), the system recognizes that there is **no clear winner** and classifies them as *related explorations* rather than claiming a false match.

#### 4. Parallel Execution (`Promise.all`)
We still run the DB query and the AI Embedding call in parallel:
- Total latency is **still bounded to ~180ms**.
- A football query (`"bicycle kick"`) matches via visual actions.
- A TikTok query (`"airfryer hack"`) matches via on-screen OCR text.
- A podcast query (`"albuterol"`) matches via speech transcription.
- A false query (`"any mention of anti-cancer"`) cleanly reports: *"No exact matches found in your videos."*

This handles medical lectures, sports highlights, TikTok clips, and casual vlogs with equal precision.