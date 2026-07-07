=== function listWithCommas(list, if_empty)
    {LIST_COUNT(list):
    - 2:
        	{LIST_MIN(list)} and {listWithCommas(list - LIST_MIN(list), if_empty)}
    - 1:
        	{list}
    - 0:
			{if_empty}
    - else:
      		{LIST_MIN(list)}, {listWithCommas(list - LIST_MIN(list), if_empty)}
    }

LIST favouriteDinosaurs = (stegosaurs), brachiosaur, (anklyosaurus), (pleiosaur)

My favourite dinosaurs are {listWithCommas(favouriteDinosaurs, "all extinct")}.

=== function isAre(list)
	{LIST_COUNT(list) == 1:is|are}

My favourite dinosaurs {isAre(favouriteDinosaurs)} {listWithCommas(favouriteDinosaurs, "all extinct")}.

My favourite dinosaur{LIST_COUNT(favouriteDinosaurs) != 1:s} {isAre(favouriteDinosaurs)} {listWithCommas(favouriteDinosaurs, "all extinct")}.
