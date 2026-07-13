Update project design structure in PROJECT_STRUCTURE.md


navigate → click "What's on your mind" → generate_text (prompt: "Write a post about how we can survive in the AI era") → stop.


PIDS=$(lsof -ti tcp:4000); echo "killing: $PIDS"; [ -n "$PIDS" ] && kill -9 $PIDS; sleep 1; (nc -z localhost 4000 2>/dev/null && echo "still up" || echo "port 4000 free")

for p in $(lsof -ti tcp:4000); do echo "kill $p"; kill -9 "$p"; done; sleep 1; (nc -z localhost 4000 2>/dev/null && echo "still up" || echo "port 4000 free")

If you run backend server for your testing purpose, then before ending task you should close the server so that i can run it myself,

- Lets do a plan for how we can imporve skill creation. Training skill feature need to modify. We should have 2 step of creating skill, 1. Introducing Element, 2. Create Skill from introduced elements. 1. introducing will include, selecting elements and defining its type, action, name, short details etc. each element may have parent element selector. this means for example we introduce post/feed list container then we introduct one post item and select it's parent as post list container, we should auto select that parent but user can update it if he want. this will be route path bounded. but we should be able to edit variable slug for example /post/[postId]. 2. Creating Skill: creating skill would be like sequential action flow of those elements. and add name and short details for the skill. this way we can just select skill and ask to do some repetitive/one time runner workflow. 

- Skill should be retrainable from the page. all data shuould be filled i should be able to re train or add new data skill. got it?

- 