Update project design structure in PROJECT_STRUCTURE.md


navigate → click "What's on your mind" → generate_text (prompt: "Write a post about how we can survive in the AI era") → stop.


PIDS=$(lsof -ti tcp:4000); echo "killing: $PIDS"; [ -n "$PIDS" ] && kill -9 $PIDS; sleep 1; (nc -z localhost 4000 2>/dev/null && echo "still up" || echo "port 4000 free")

for p in $(lsof -ti tcp:4000); do echo "kill $p"; kill -9 "$p"; done; sleep 1; (nc -z localhost 4000 2>/dev/null && echo "still up" || echo "port 4000 free")

If you run backend server for your testing purpose, then before ending task you should close the server so that i can run it myself,

- We need to do something like take me toure feature. so it will be teach me skill toure feature. in this feature. user will do operations lively and our skill learer will record what is the user doing and optionally ask the user what he did. this way we can do capture lots of human behavioral skill and save it in our agent skill database. got it? do a great plan for this feature. 

- We need a special tool which can execute code in browser, for example we asked a question to do some work. but we dont have a tool which can do that work, in this situation i want ai to write code and executor tool execute code in browser to achive that job, and verify its result if it dose not meet the expected output it should try diffferent way and so on..
