Выполни "боевое" тестирование сервера через доступ по тунелю. Все необходимые инструкции найдешь в файле maintest.md, когда будешь создавать пользователей, дай
  мне список, я верефицирую email вручную. В конце подготовь анализ теста.

## main test every endpoints

URL = https://surely-breach-revision-settled.trycloudflare.com

1. connect to server by URL
2. Use main admin login: admin01 password: StrongPass123 
3. register 3 students 
4. register 3 teachers
5. register 1 additional admin

### wait an email verification procedure

6. link every student to every teacher
7. make one teacher a moderator
8. edit surname and name of one student by main admin
9. edit city and class of any other student by additional admin
10. make three task of different kind by main admin
11. make three task of different kind by additional admin
12. make three task of different kind by teacher-moderator
13. edit any three task (change the right answer) by main admin
14. edit any three task (change the right answer) by additional admin
15. make an olympiad with all possible tasks by main admin
16. publish this olympiad
17. Try the olympiad by three any students. One should make it 100% right, the second 50% right, the third 0% right
18. Look through the attempts by students
19. Look through the attempts by teachers
20. Loo all attempts of the olympiad by main admin
21. Make another olympiad by additioanl admin with grade limit that not every student may try it on
22. Check the restrict access to the second olympiad by student with non-possible grade
23. Delete 3 tasks by main admin
24. Delete the second olympiads by main admin
25. Make and publish an article by main admin
26. Make and publish an article by additional admin
27. Make and publish an article by moderator
28. Unpudlish the article of additional admin by main admin
29. Unpudlish the article of moderator by main admin
30. Edit the article of additional admin and publish it by main admin
31. Edit the article of moderator and publish it by main admin
32. Make and publish news by main admin
33. Make and publish news by additional admin
34. Make and publish news by moderator
35. Unpudlish news of additional admin by main admin
36. Unpudlish news of moderator by main admin
37. Edit news of additional admin and publish it by main admin
38. Edit news of moderator and publish it by main admin
39. Turn the moderator role off 
40. Delete additional admin by main admin or change his role

## Use your own scenario and scripts to check all others endpoints

if nessecery you may ask for help