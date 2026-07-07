// Lists don't need to have multiple entries: they can be used as a state-machine,
// set with =, ++ and --, and tested with ==, <, <=, > and >=.

// LIST_COUNT, LIST_MIN and LIST_MAX refer to who's in/out, not the full set of possible
// values. We can access that "full" list using LIST_ALL.
LIST DoctorsInSurgery = (Adams), Bernard, (Cartwright), Denver, Eamonn

{LIST_ALL(DoctorsInSurgery)} // Adams, Bernard, Cartwright, Denver, Eamonn
{LIST_COUNT(LIST_ALL(DoctorsInSurgery))} // "5"
{LIST_MIN(LIST_ALL(Eamonn))} 				// "Adams"

// Advanced: "refreshing" a list's type - make an empty list that still knows its type.
LIST ValueList = first_value, second_value, third_value
VAR myList = ()

~ myList = ValueList()

{ LIST_ALL(myList) }

// Advanced: a portion of the "full" list, using LIST_RANGE. Min/max are inclusive.
LIST primeNumbers = two = 2, three = 3, five = 5, seven = 7, eleven = 11, thirteen = 13, seventeen = 17, nineteen = 19

{LIST_RANGE(LIST_ALL(primeNumbers), 10, 20)} // 11, 13, 17, 19
