LIST Discs = one, two, three, four, five, six, seven
VAR post1 = ()
VAR post2 = ()
VAR post3 = ()

~ post1 = LIST_ALL(Discs)

-> gameloop

=== function can_move(from_list, to_list) ===
    {
    -   LIST_COUNT(from_list) == 0:
        // no discs to move
        ~ return false
    -   LIST_COUNT(to_list) > 0 && LIST_MIN(from_list) > LIST_MIN(to_list):
        // the moving disc is bigger than the smallest of the discs on the new tower
        ~ return false
    -   else:
    	 // nothing stands in your way!
        ~ return true
    }

=== function move_ring( ref from, ref to ) ===
    ~ temp whichRingToMove = LIST_MIN(from)
    ~ from -= whichRingToMove
    ~ to += whichRingToMove

== function getListForTower(towerNum)
    { towerNum:
        - 1:    ~ return post1
        - 2:    ~ return post2
        - 3:    ~ return post3
    }

=== function name(postNum)
    the {postToPlace(postNum)} temple

=== function Name(postNum)
    The {postToPlace(postNum)} temple

=== function postToPlace(postNum)
    { postNum:
        - 1: first
        - 2: second
        - 3: third
    }

=== function describe_pillar(listNum) ==
    ~ temp list = getListForTower(listNum)
    {
    - LIST_COUNT(list) == 0:
        {Name(listNum)} is empty.
    - LIST_COUNT(list) == 1:
        The {list} ring lies on {name(listNum)}.
    - else:
        On {name(listNum)}, are the discs numbered {list}.
    }


=== gameloop
    Staring down from the heavens you see your followers finishing construction of the last of the great temples, ready to begin the work.
- (top)
    +  [ Regard the temples]
        You regard each of the temples in turn. On each is stacked the rings of stone. {describe_pillar(1)} {describe_pillar(2)} {describe_pillar(3)}
    <- move_post(1, 2, post1, post2)
    <- move_post(2, 1, post2, post1)
    <- move_post(1, 3, post1, post3)
    <- move_post(3, 1, post3, post1)
    <- move_post(3, 2, post3, post2)
    <- move_post(2, 3, post2, post3)
    -> DONE

= move_post(from_post_num, to_post_num, ref from_post_list, ref to_post_list)
    +   { can_move(from_post_list, to_post_list) }
        [ Move a ring from {name(from_post_num)} to {name(to_post_num)} ]
        { move_ring(from_post_list, to_post_list) }
        { stopping:
        -   The priests far below construct a great harness, and after many years of work, the great stone ring is lifted up into the air, and swung over to the next of the temples.
            The ropes are slashed, and in the blink of an eye it falls once more.
        -   Your next decree is met with a great feast and many sacrifices. After the funeary smoke has cleared, work to shift the great stone ring begins in earnest. A generation grows and falls, and the ring falls into its ordained place.
        -   {cycle:
            - Years pass as the ring is slowly moved.
            - The priests below fight a war over what colour robes to wear, but while they fall and die, the work is still completed.
            }
        }
    -> top
