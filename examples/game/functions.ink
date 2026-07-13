// Used for raising a 1-100 value by a set amount
=== function bumpUp(ref value, amount) ===
    ~ value += amount
    {value > 100: 
        ~ value = 100
    }
        
    ~ return
  
// Used for lowering a 1-100 value by a set amount.
=== function bumpDown(ref value, amount) ===
    ~ value -= amount
    {value < 0:
        ~ value = 0
    }
    ~ return

// Useful for when we want to quickly write gender-specific language inline with the text
=== function genderOption(value, he, she, they) ===
    {value:
    - 1:
        ~ return he
    - 2:
        ~ return she
    - 3:
        ~ return they
    }
    ~ return they