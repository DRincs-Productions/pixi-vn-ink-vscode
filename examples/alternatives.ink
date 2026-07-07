// Alternatives can contain blank elements.
I took a step forward. {!||||Then the lights went out. -> eek}

// Alternatives can be nested.
The Ratbear {&{wastes no time and |}swipes|scratches} {&at you|into your {&leg|arm|cheek}}.

// Alternatives can include divert statements.
I {waited.|waited some more.|snoozed.|woke up and waited more.|gave up and left. -> leave_post_office}

// They can also be used inside choice text:
+ 	"Hello, {&Master|Monsieur Fogg|you|brown-eyes}!"[] I declared.

// ...with one caveat; you can't start an option's text with a `{`, as it'll look like a conditional.
// ...but the caveat has a caveat, if you escape a whitespace `\ ` before your `{` ink will recognise it as text.
+\	{&They headed towards the Sandlands|They set off for the desert|The party followed the old road South}


=== turn_on_television ===
I turned on the television {for the first time|for the second time|again|once more}, but there was {nothing good on, so I turned it off again|still nothing worth watching|even less to hold my interest than before|nothing but rubbish|a program about sharks and I don't like sharks|nothing on}.
+	[Try it again]	 		-> turn_on_television
*	[Go outside instead]	-> go_outside_instead

=== go_outside_instead ===
-> END
