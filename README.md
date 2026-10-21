# DA Ranch Vineyard App

This is the field app for DA Ranch. It keeps blocks, row work, sprays, water, weeds, harvest samples, equipment service, and hours. Several people can use it. Each person signs in on their own phone.

The vineyard name stays **DA Ranch**. The app on the phone is called **DA Ranch Vineyard App**.

## What you do with it

Open the app and tap **Start work**. Pick the block, or **Non-field work** for a fence, planting, or tractor. Pick the task. On a block, tap the row you are starting. That starts the clock.

The running job shows who is on it. Tap a name under **Add person** when someone joins. Their clock starts at that moment. Tap **Off** next to a name when that person leaves. Their time stops, and everyone else keeps going. Tap **Done** when the work is finished, tap the last row, then **Partial** or **Complete**. That stops the clock for everyone still on the job. Each person gets their own hours, from when they joined until they left, minus their own lunch.

If two phones change the same job before they can sync, the earlier stop is the one that counts. A person is not given two copies of the same time. Lunch, the 2:25 stop, and the question before starting a second job are for each person.

If two phones both start the same row and task with no signal, those become one job when the phones sync. Each person still has their own hours. If one phone says Partial and the other says Complete, the rows stay Complete and the clock uses the earlier stop. Checking one person off, while another phone ends the job, stops that person at the earlier time and leaves everyone else’s stop on the job end. The same person clocked on two phones is one clock, not two. A later session the same day, after the first one has already stopped, stays a separate job.

- Not started is pale red.
- Partial is half green and half pale red.
- Complete is green.

Those three colors stay the same if you change the app color.

A clock left running stops itself at the end of the day. That time is 2:25 in the afternoon, Arizona time, unless a manager changes it. The stop uses 2:25, not the moment someone next opens the phone.

**Lunch out** pauses the clock. **Lunch in** starts it again. Lunch does not count as hours.

If you forgot to tap, use **More → Add forgotten hours**.

Water is logged in hours. Each plant has two half-gallon emitters, so one hour is about one gallon per plant.

Sprays can include a recommendation number and a photo. The photo sends when the phone has Wi-Fi.

The spray pages and the watering page show the weather for the vineyard’s point near Cornville Rd. That comes from the National Weather Service: the nearest station right now, the next few hours, tomorrow, and the week, with wind and the chance of rain. The phone asks for a new reading when it has Wi-Fi, saves it, and still shows it with no service. **Updated** is Arizona time. At 100° or hotter today, a heat notice stays at the top of every screen. If this phone already allows notifications, it sends one heat alert that day and does not ask again. A manager can change the map point and the Cornville station link under **More → Color and settings**.

On a block, a task, or a job in that block, one short line about that grape sits under the title. It changes between visits and still shows with no service. Counoise has no variety line that could be checked, so those blocks use the general lines. Five of those general lines are Kevin Zraly’s, read from the 2005 Sterling edition of Windows on the World Complete Wine Course (pages 2, 3, 15, and 20). No variety line from that book was added: the grape chapters were not on the pages that could be read, and nothing was paraphrased. A manager adds or edits lines under **More → Blocks, tasks, chemicals**, including the author and the book or article.

The home screen has a small **Did you know** card under the hours. It shows one checked fact about photosynthesis, Brix, acids, pH, phenolics, heat, sampling, powdery mildew, or a hard water deficit. It changes between visits and still shows with no service. Ten facts are from the BC Wine Grape Council fruit-sampling guide. One is the UC note that fruit under 8 Brix is highly susceptible to powdery mildew, berries past about 15 Brix become resistant, and temperatures above 91°F can kill the fungus. One is the UC note that stomata let in the carbon dioxide for photosynthesis, and a hard deficit from veraison to harvest can sunburn and raisin fruit. A manager edits the list on the same screen as the quotes.

**Learn more** on a block opens a field note for that variety: vigor, budbreak and ripening, clusters and berries, disease and pests, heat and drought, Arizona, harvest chemistry, and canopy. The timing is the French Plantgrape catalogue compared with Chasselas at Domaine de Vassal, and each note says those dates are not Arizona dates. That catalogue does not publish a target Brix, pH, or titratable acidity, so the harvest line says to use this block’s own samples. The seed blocks are filled in, plus Merlot, Viognier, Mourvèdre, Chardonnay, Sangiovese, and Barbera. Malvasia, Greco (the Grecco De Tuffo block), and Teroldego are stored and flagged **Needs research**, because no field-catalogue page was found for them. A variety with no row shows that same flag and an empty page, and the app does not invent a note. Syrah 471 keeps the short ENTAV line (few decline symptoms, less compact clusters, good maturity). Syrah 525 is not on the French certified-clone list that was read. The only 525 result included is the Kearney trial in the San Joaquin Valley, and the page says that trial is not Arizona. A manager or Aaron edits the note on that page. **Ask a question** is on the page and switched off. It is reserved for a later server function named `ask-variety`, scoped to that variety. The phone does not call it.

**More → Find parts**, and **Find parts** on an equipment row, opens a web search for fencing, irrigation, tractor parts, golf cart parts, and Gator or UTV parts. The buttons go to the browser: a general search, Tractor Supply, John Deere parts, Kubota parts, Amazon, eBay, and GolfCartParts.com. Make, model, serial, and year are stored on the equipment. A machine search fills those in. If the model is blank, the screen asks for it and saves it. The searches need a connection. Offline, the screen says so and does not pretend to open them. Recent part numbers stay on the phone.

## Sign in once

The first sign-in needs Wi-Fi. After that the phone stays signed in. Row taps and logs work with no service. They send themselves when the phone is back on Wi-Fi.

Open the app on Wi-Fi at least once in a while so the hours leave the phone. An iPhone does not reliably send them in the background. Android can, after you install the app.

## Add someone

A manager, or Aaron, adds the person under **More → Crew**.

1. Type their name and email.
2. On their phone they tap **Create account** and use that same email.
3. They pick their own password.
4. They stay signed in.

A manager can also type a starting hourly wage. That wage is not visible to anyone except a manager.

## Who can do what

**Employee.** Logs work, sees hours for each task, and can add a task name. They can fix their own entries for a few days (3 days unless a manager changes it). They never see wages or labor cost.

**Manager.** Everything an employee can do, plus crew, wages, the end-of-day time, and labor cost. Cost is a total for a task or a pass. The app does not show what each person earned. A manager can ask for someone else to become a manager. Creating an account does not make anyone a manager. That person stays an employee until Aaron approves the request.

**Developer (Aaron).** Can rename tasks, change the lists, add people, read problem reports, and log field work. Under **More → Manager requests**, approve or turn down each manager request. Until you approve, that person stays an employee. This login cannot see wages or labor cost. The database blocks it, not just the screen.

Aaron approves the first crew lead in the app. That manager then sets wages and the 2:25 end-of-day time. Aaron’s developer login cannot do those two things.

## On the phone

- iPhone: Share, then **Add to Home Screen**.
- Android: the browser menu, then **Install app**.

**More → Color and settings** changes only your phone. Vineyard, Sand, Night, or Grape.

## January 1

The new year starts fresh on the home screen: row colors, sprays, water, weeds, and samples. Blocks, tasks, and equipment stay. Nothing is deleted. Older seasons are still in **Export**.

## Export

**Export** makes a spreadsheet or a written report: overview, sprays, block-by-block, and labor.

Labor can be grouped by task, by pass, or both. If you show both, do not add those two sections together. Task hours already include the pass, split across the tasks in the pass.

A manager’s labor report can include cost. Other logins get hours only.

## Combined passes

A pass is several jobs done in one walk, for example nets up, clip the top, and clip the bottom. A manager or Aaron adds it under **More → Combined passes**. Logging the pass marks every one of those tasks on the rows you tap. The full time is kept for the pass, and the same time is split evenly across the tasks. That example is not already in the app. You add it when you want it.

## If something looks wrong

Tap **Problem** and write what happened. It saves on the phone and sends with the next Wi-Fi. A manager or Aaron can read those notes under **More → Problem reports**.

The first time you sign in, if this phone still has the old vineyard notes, the app asks to bring them in. Say yes once.

The first time an account opens the app, a short tour starts. It covers the block, the task, the start row, lunch, Partial or Complete, adding someone or checking them off, the Problem button, and the color picker. A manager also gets the crew, wage, cost, end-of-day, pass, chemical, and export steps. Aaron gets the step for approving a manager and reading problem reports. **Skip** is on every step. The account remembers that, even with no signal, and does not show the tour again. To watch it later, open **More → Color and settings → Show the tour again**.

This release also has one line in the tour for Elliott. After the crew has seen it, set `TOUR_ELLIOTT_NUDGE` to `false` in `js/config.js`. That removes the line and leaves the rest of the tour.

## Setup (one time)

This section is for putting the app on the internet. The crew does not need it.

The app is a set of files. GitHub Pages serves them. Supabase holds the shared records. You do not put the secret key in GitHub or in the app. The publishable key in `js/config.js` is meant to be public. Row security in the database is what keeps vineyards, and wages, apart.

### 1. Run the SQL

In the Supabase dashboard, open **SQL Editor**. Run these files in this order, one at a time. They are safe to run again.

1. `supabase/migrations/20261021120000_schema.sql`
2. `supabase/migrations/20261021120100_functions.sql`
3. `supabase/migrations/20261021120200_rls.sql`
4. `supabase/migrations/20261021120300_storage.sql`
5. `supabase/migrations/20261021120400_seed.sql`

That creates DA Ranch, the blocks, the ten tasks, the spray list, equipment service types, the variety quotes, the did-you-know facts, the variety field notes, and the private `spray-photos` bucket. It does not create a login. Running it again does not duplicate a fact or a variety note.

### 2. Create Aaron’s account, then make it the developer

In the app, create an account with Aaron’s email. Then run `supabase/assign-developer.sql` in the SQL Editor. Change `aaron@example.com` in that file to the same email first.

That file is not part of the five migrations, so a placeholder email never becomes a developer by accident.

Then sign in as Aaron. Under **More → Manager requests**, approve the person who should set wages. A manager invite, or **Ask for manager** on the crew screen, only files that request. The person stays an employee until you approve it. Turning a request down leaves them an employee. You can still make a manager back into an employee without a second approval.

### 3. Auth settings

In **Authentication**:

- Email provider: on.
- Confirm email: **off**. If this stays on, a new person cannot sign in until they open a confirmation mail, which is a poor fit for the ranch.
- Site URL: `https://asweiss1.github.io/DAtestapp/`
- Redirect URLs: `https://asweiss1.github.io/DAtestapp/` and `http://127.0.0.1:4173/`
- Leave “single session per user” off, so a phone is not kicked off when someone signs in somewhere else.
- Access tokens can stay at about one hour. The refresh token keeps the phone signed in.

### 4. Storage

After the SQL, **Storage** should show a bucket named `spray-photos`. It stays private. Photos are limited to 10 MB and to jpeg, png, webp, gif, heic, and heif. Do not switch the bucket to public.

### 5. GitHub Pages

Deploy from the `main` branch, folder `/` (root). The address is `https://asweiss1.github.io/DAtestapp/`.

### 6. Another vineyard later

The database can hold more than one vineyard, fully separated. `create_vineyard` exists for that. There is no button for it in the crew screens. DA Ranch is the one this app is set up for. The person who creates a new vineyard becomes its manager, because that vineyard has no developer yet. That does not make them a manager of DA Ranch.
