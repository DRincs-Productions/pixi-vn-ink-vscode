


== Chapter1_TheLanding
VAR consoleTheGuy = false
The sun is a pinprick against a foreign smear of stars, and the arc of the red planet stretches out below in the hazy viewport window. Mars.

Finally.

You've spent months aboard the Transplanetary Seven between Earth and Mars. Thirty years ago, the vessel had been the Mars Corporation's flagship. It was once the peak of luxury. Class. It was the greatest ride in the galaxy.

* It sure didn't feel like it.
    {bumpDown: optimism 10}
    No, it didn't. Three of your fellow passengers contracted stomach bugs and you swear you saw a family of squirrels living near the food supplies.
    
    ** Squirrels?
        They're like the rats of space and uncannily good at maneuvering in low-G environments.

* It was showing its age a little, but there were good things, too.
    Were there, though? If you say so. Most of your fellow passengers only saw the grimy floors and shoddy safety equipment. Realistically, there probably were some redeeming factors, but those toilets were nasty.
    
* Everything was fabulous.
    {bumpUp: optimism 10}
    Really? Fabulous? You're just a ray of sunshine, aren't you?
    
- These days the Transplanetary Seven is the third line coach class of the most incredible journey anyone has ever taken.

You can feel a collective sigh as the other passengers of your cohort drift through the gravity-free hub toward their seats on the landing shuttle. The journey is almost complete.

All that's left is one somewhat terrifying landing and then you can start your new life on Mars.

The shuttle shakes. Is it a death rattle or a normal part of the warmup process? An alarm chirps, then goes silent.

* Nothing scares me.
    {bumpUp: boldness 10}
    Really? There's a line between bold and foolish, you know. That line is pretty close to the vaccuum of space for most people.

* I personally checked the shuttle's safety systems.
    {bumpUp: engineer 10}
    You did? That was pretty smart of you. Things could still go horribly wrong though.
    
    ** Thanks a lot.
        Probably best not to think about it.

* This is terrifying.
    {bumpDown: boldness 10}
    It really is, isn't it? But, you need to endure it anyway. I'm sure it'll be fine.

- Mars is so close. Face pressed against the glass, you almost feel the open freedom you once knew on Earth. It's a freedom you're not sure you'll ever feel again, now that you're finally emigrating to Mars.

You'll never again see the naked sky. You'll never roam free in fields or forests. It was your choice to come here, but you're keenly aware of what you're giving up.

Everything.

Friends, family, your job. Everything. Even your pet.

 * I had a dog.
    ~ pet = "dog"
    {bumpUp: warmth 10}
    His name was Rufus, and he was a terrier mix. The shelter placed him with an elderly grandmother right away, and you're sure he's happy enough. You still miss him, but you couldn't afford to bring him with on the Transplanetary Seven. Dogs cost almost as much as humans, and it took every penny you owned to buy a ticket.
    
 * I had a cat.
    ~ pet = "cat"
    {bumpUp: warmth 10}
    Her name was Scratch, and she loved to roam outside your tiny apartment complex. You couldn't bring yourself to contain her inside an even tinier Mars residence. Instead, you gave her to the neighbor kid, who always looked like she needed a friend.

 * Actually, I didn't even have a pet.
    ~ pet = "none"
    {bumpDown: warmth 10}
    To be honest, you didn't have much in the way of friends or family, either. The choice to leave for Mars was still a tough one, but you've always traveled too much to form connections. This is getting depressing. Are you depressed? How can you be depressed with Mars so close? This is amazing!

    Amazing!

- A man in a rumpled spacesuit bustles past you on his way to his seat. Like most of these passengers, he has the thousand-yard stare of a long-time space traveler. Maybe this voyage is routine for him, but this is your first trip across the depths of space, and this whole trip has been in a windowless hamster wheel. You deserve a little time pressed up against the viewing window. This might be your last chance to act like a tourist for a long time.

"Buckle up," says the shuttle captain through a tinny intercom. "It's going to be a bumpy one."

* I buckle up.
    ~ rulefollower = true
    {bumpDown: boldness 5}
    -> BuckledIn
* Screw that, I keep looking out the window.
    ~ rulefollower = false
    {bumpUp: boldness 5}
    -> Window
    
* I buckle up, but not because I'm some kind of rule follower.
    {bumpDown: boldness 5}
    -> BuckledIn
    Does this go here?

== BuckledIn
You float to your designated seat and buckle the five-point harness. You can't see much through the window from this location, but who needs stars anyway? Pretty soon you'll be making your fortune on Mars.

Mars!

What will the red planet bring you?

* Wealth.
    {bumpUp: optimism 5}
    {bumpUp: boldness 5}
    There are jobs on Mars, and you have skills.
    
* Excitement.
    {bumpUp: boldness 10}
    Adventure! Think of all the amazing things you'll see.
    
* Purpose.
    {bumpUp: warmth 5}
    {bumpUp: optimism 5}
    With any luck, you'll find a community where you belong. You'll find a reason to work hard and connect with those around you.
    
-At the moment, the main thing Mars brings you is gravity. You glance at the passenger next to you, an older man with a handlebar mustache. Sweat beads his brow and he alternates between squeezing his eyes shut and staring at the shuttle wall in front of him.

* I chat a little. Maybe it'll help his stress.
    -> Conversation

* I chat a little. Maybe it'll help <i>my</i> stress.
    -> Conversation
    
* I ignore him.
-> EndChapter

== Window
Other passengers buckle themselves tightly into their seats, but you refuse, watching as the big red planet swells below as the Transplanetary Seven slowly rotates. The stars blur behind the haze of Mars's thin atmosphere.

You press your forehead against the cold window. Could this be it? The place where finally you might find purpose and peace? Could this be everything that the Mars Corporation promised when they recruited skilled laborers on the red planet? Seeing the horizon like this reminds you of their logo, with its red curve under a glowing yellow star.

"Get in your seat," grumbles another passenger. "I don't want them aborting the landing now."

They wouldn't abort the landing. Mars Corporation is known for a lot of things, but the strict adherence to safety protocols isn't one of them.

Is it?

* I check the shuttle for safety.
    {bumpUp: engineer 10}
    {bumpDown: optimism 5} 
    At first glance, everything looks to be in good shape, but you've had some experience working as an engineer. Your attention to detail flags several issues.
    
    The rubber seal around the airlock door is corroded. Three of the twelve emergency oxygen tanks are either low or their guages are not properly registering. Several of the seats are missing their attached floation devices, though why anyone thought a flotation device would be needed for a Mars landing is beyond you.
    
    Your check of the shuttle's adherence to safety standards has not left you more confident in its ability to reach the surface.

* I look out the window some more. It's so beautiful!
    {bumpUp: warmth 10}
    {bumpUp: optimism 5}
    It is, isn't it? When you first left Earth you had a chance to see the planet from this distance. That was beautiful, too, but so, so different. To many, Mars might appear to be a barren wasteland, but you know there are dozens of settlements, research stations, and manufacturing facilities.
    
    You suspect that the glint you see on the horizon is from the Olympus Mons Tower, home of the Mars Corporation's headquarters. It's said to be the pinacle of glamor and technology, and its home of the most powerful figures on all of Mars. In the whole solar system, really.
    
    And now its going to be your home.

* I go to my seat.
    {bumpDown: optimism 5}

- You push off of the wall and pull yourself into the last remaining seat. The belts are frayed and there's a sticky spot on the headrest, but it seems solid enough. It'll get you there.

* Continue
    -> TheApproach

== Conversation
 
{ pet:
- "dog": 
    <> "I miss my dog, Rufus," you say.
- "cat":
    <> "I miss my cat, Scratch," you say.
- else:
    <> "I already miss the smell of pine trees," you say.
} <> "How about you?"

His eyes dart around. "They almost lost a shuttle last week."

You strain your neck to look back at the other passengers. Nobody seems to be listening. "Wouldn't that have been in the news?"

"I said <i>almost</i>." The man tugs at the twin tails of his mustache. "There's no mandatory reporting for an almost."

You go silent. Chatting is not having its intended effect.

"I overheard the captain joking about it over the radio. It's like he thinks the new safety protocols are a joke."

"Are they?"

"I'm not laughing."

* I laugh.
    {bumpUp: boldness 20}
    {bumpUp: presence 10}
    -> ManiacleLaughter
    
* I sit in somber silence and wait for our doom.
    {bumpDown: warmth 10}
    {bumpDown: optimism 20}
    -> TheApproach
    
* I reassure the man that there is nothing to worry about.
    {bumpUp: presence 10}
    {bumpUp: boldness 10}
    {bumpUp: optimism 10}
    ~ consoleTheGuy = true
    "They run these shuttles all the time," you say. "There's nothing to worry about."
    
    Surprisingly, it seems to help. The man takes several deep breaths and closes his eyes. Others around you are paying attention.
    
    {engineer > 10: "I've checked the systems of this shuttle," you say. "It's solid."|"The crew knows what they're doing, and it's their lives on the line, too. We're going to be fine."}
    
    The murmur of tension in the cabing subsides and the passengers prepare themselves for the descent.
    
    -> TheApproach

== ManiacleLaughter
~ maniacle = true
It starts as a low chuckle in the pit of your stomach, and it earns you a sideways glance from the mustachioed man.

Then it grows. A grin splits your face and tears bead on your eyes, blearing your vision in the zero-G. Unable to restrain yourself, you bark one loud laugh, then another. The thought of a months' journey through the solar system only to face death on the descent is hilarious for some reason.

Then, across the aisle, a woman in a crisp, clean spacesuit starts to snicker. The man next to her smiles in a way that makes his eyes sparkle. The man with the mustache flashes a nervous grin, but you seem to have dispelled the nervous sweat he was forming.

Soon, everyone in the passenger compartment is laughing except the crew, who frantically check the gauges for whatever atmospheric imbalance must be causing your burst of humor.

But they find nothing. You're laughing in the face of danger, and you've inspired others to laugh with you.

If this is the end, it'll at least be fun.

* Continue
    -> TheApproach
    
==TheApproach
Then, it's time. The approach. The final dangerous descent onto the red planet.

The shuttle detaches from Transplanetary Seven with a thunk. A gentle nudge of gravity pulls taught the belts around your shoulders. {boldness > 50: You take a deep breath, remaining calm under the pressure.|Your heart pounds in your chest as useless adrenaline surges through your bloodstream.}

Something doesn't feel quite right. You've always had a good instinct for these things. Maybe it's in the sound of the engine. Maybe it's the nervous look on the crew's faces. Could be a phychic connection to the divine. {engineer > 10: The shuttle is solid. You made sure of that yourself. It must be something else.}

Or maybe it's just that you know you're unlucky.

The shuttle's accelleration gently pushes you into the back of your seat.

Then, pressure increases.

"Helmets up, passengers," the captain says over the intercom.

"That's not a good sign, is it?" {consoleTheGuy: the man says. He doesn't seem overly concerned, but the question is one you're asking yourself, too.|the man next to you says, his voice tight with panic.}

{maniacle: Laughter bubbles up in the back of your throat.|"I'm sure it'll be fine," you say. {boldness > 50: You speak with a bold conviction that calms the man.|You swallow the lump in your throat, not at all convinced by your own words.}}

You press a button on your shoulder and your helmet unfolds to cover your head. The mechanical seal latches, whirs, and lets out a grinding screech as its mechanism partially fails.

<i>This</i> might be something to worry about. A loud hiss comes from somewhere to your left where the seal is incomplete.

All around you, passengers struggle with their helmets as cabin pressure drops. The crew, a pair of tall Martians in matching red uniforms, work their way down the aisle assisting the worst of them.

The man next to you {consoleTheGuy: gasps|screams} in frustration. His helmet has failed to deploy and it's stuck halfway. Air in the shuttle is rapidly thinning.

* I seal my helmet and then help him.
    
    -> EndChapter

* I help him and then fix my own leak.
    -> NeighborCrisis.HelpingNeighborFirst

* I focus on my own problems.
    -> NeighborCrisis.NotHelping
TODO: and this

== NeighborCrisis
= HelpingNeighborFirst
Your helmet still hisses in your ear, but your neighbor's helmet hasn't deployed at all. He's panicked and pale. You grab the mechanism behind his neck in your gloved fingers and pull.
    
The delicate mechanism resists. It's designed to quietly slip into place, sealing his suit at the slightest hint of adverse conditions, but something's jammed. Maybe these Mars Corporation suits aren't as well-maintained as advertised. Peering closely you see the red grit dusting its gears. It looks like the jagged sand of Mars.

How fitting.

* I clean it as best I can.
    

* I use my tools to make the delicate adjustments needed.
    -> EndChapter

* I force the mechanism.
    TODO force the mechanism
    -> EndChapter
    
- 

= HelpingNeighborSecond
    TODO help neighbor first.
= NotHelping
    TODO don't help the neighbor at all.

* I stay calm.
    -> Descent.Calm

* I freak out a little.
    -> Descent.FreakOut

* I just act normal, all right?
    -> Descent.NormalDescent
    
== Descent
= Calm
    -> EndChapter
= FreakOut
    -> EndChapter
= NormalDescent
    -> EndChapter

You're in your own bubble, and all you can do is watch the chaos around you as the shuttle rattles from several impacts. Lightning-fast shots rattle the cabin, and the man next to you clutches a leg that is now a fountain of blood bubbling up into a vacating atmosphere.

The captain's voice rings in your helmet comm. "We're experiencing some meteor activity. Please remain calm and we will be through this momentarily."

Many others are not calm. The man beside you does not. He grasps at his belt buckles, shouts inside his helmet, even though nobody can hear him, and just generally bleeds all over everything.

-> EndChapter

== EndChapter
* Continue to Chapter 2

-> DONE



