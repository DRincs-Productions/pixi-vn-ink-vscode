Test(test)

=== function say_yes_to_everything ===
	~ return true

=== function lerp(a, b, k) ===
	~ return ((b - a) * k) + a

~ x = lerp(2, 8, 0.3)

*	{say_yes_to_everything()} 'Yes.'

=== function say_no_to_nothing ===
	~ return say_yes_to_everything()

=== function harm(x) ===
	{ stamina < x:
		~ stamina = 0
	- else:
		~ stamina = stamina - x
	}

Monsieur Fogg was looking {describe_health(health)}.

=== function describe_health(x) ===
{
- x == 100:
	~ return "spritely"
- x > 75:
	~ return "chipper"
- x > 45:
	~ return "somewhat flagging"
- else:
	~ return "despondent"
}

Monsieur Fogg was looking {describe_health(health)}.

=== function describe_health(x) ===
{
- x == 100:
	~ return "spritely"
- x > 75:
	~ return "chipper"
- x > 45:
	~ return "somewhat flagging"
- else:
	~ return "despondent"
}

=== function print_num(x) ===
{
    - x >= 1000:
        {print_num(x / 1000)} thousand { x mod 1000 > 0:{print_num(x mod 1000)}}
    - x >= 100:
        {print_num(x / 100)} hundred { x mod 100 > 0:and {print_num(x mod 100)}}
    - x == 0:
        zero
    - else:
        { x >= 20:
            { x / 10:
                - 2: twenty
                - 3: thirty
                - 4: forty
                - 5: fifty
                - 6: sixty
                - 7: seventy
                - 8: eighty
                - 9: ninety
            }
            { x mod 10 > 0:<>-<>}
        }
        { x < 10 || x > 20:
            { x mod 10:
                - 1: one
                - 2: two
                - 3: three
                - 4: four
                - 5: five
                - 6: six
                - 7: seven
                - 8: eight
                - 9: nine
            }
        - else:
            { x:
                - 10: ten
                - 11: eleven
                - 12: twelve
                - 13: thirteen
                - 14: fourteen
                - 15: fifteen
                - 16: sixteen
                - 17: seventeen
                - 18: eighteen
                - 19: nineteen
            }
        }
}

=== function alter(ref x, k) ===
	~ x = x + k

~ gold = gold + 7
~ health = health - 4

~ alter(gold, 7)
~ alter(health, -4)

*	I ate a biscuit[] and felt refreshed. {alter(health, 2)}
* 	I gave a biscuit to Monsieur Fogg[] and he wolfed it down most undecorously. {alter(foggs_health, 1)}
-	<> Then we continued on our way.

