Update project design structure in PROJECT_STRUCTURE.md


navigate → click "What's on your mind" → generate_text (prompt: "Write a post about how we can survive in the AI era") → stop.


PIDS=$(lsof -ti tcp:4000); echo "killing: $PIDS"; [ -n "$PIDS" ] && kill -9 $PIDS; sleep 1; (nc -z localhost 4000 2>/dev/null && echo "still up" || echo "port 4000 free")

for p in $(lsof -ti tcp:4000); do echo "kill $p"; kill -9 "$p"; done; sleep 1; (nc -z localhost 4000 2>/dev/null && echo "still up" || echo "port 4000 free")

If you run backend server for your testing purpose, then before ending task you should close the server so that i can run it myself,

- Lets do a plan for how we can imporve skill creation. Training skill feature need to modify. We should have 2 step of creating skill, 1. Introducing Element, 2. Create Skill from introduced elements. 1. introducing will include, selecting elements and defining its type, action, name, short details etc. each element may have parent element selector. this means for example we introduce post/feed list container then we introduct one post item and select it's parent as post list container, we should auto select that parent but user can update it if he want. this will be route path bounded. but we should be able to edit variable slug for example /post/[postId]. 2. Creating Skill: creating skill would be like collection of  those introduced elements, so we should be able to select elements in skill so that skill will use those elements to do task. and add name and short details for the skill. this way we can just select skill and ask to do some repetitive/one time runner workflow. Introdud element should be reintroduceable from the page because if any website remove previous element and create new element but both feature/work same. so we should be able to repoint/reintroduce it. 

- When task is running, for example i asked to write post, and click "Next" button, and then click "submit" button. in this situation some time elements dose not load immidiately for stepped form. so what we can do is: we should not immidiately raise error and close the task, instead we should do retry, each retry should wait like Exponential Backoff Doubling the wait interval after every successive failure (e.g., 1s, 2s, 4s, 8s). so 4 retry count. we can do similar strategy with tool calling. so if we found error we wait and retry before taking task closing decission. 

- We should be able to create system prompt, system prompt will include skills. and when we start new task we should be able to select system prompt and skills, both are optional. 

- Same schema duplicate issue need to fixed. and we should be able to do daily task. like we may have daily fb post scrapper task. so instead of creating new task we should be able to run previously created task again with optinally additional commnad. which will collect all data in one place. and also we can run the task seperately so that it use same comands and same flow in seperate task. give me honest suggestion, in this situation do we actually re run the planner, i think we can reuse previous plan because we are re running the same task. only executions will rerun. 

