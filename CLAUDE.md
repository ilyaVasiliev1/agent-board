# agent-board

Панель задач для облачных агентов. Статическая страница без сборки на GitHub Pages: задачи хранятся в issues проекта, панель читает и меняет метки через GitHub API. Токен лежит только в localStorage браузера.

## Модель состояний

`(нет метки)` очередь → `st:queued` → `st:running` → `st:review` → принято (`st:accepted`, issue закрыт) или доработка (`st:queued` снова). `st:failed` для сбоя исполнителя. Движок выбирает метка `engine:claude` или `engine:hermes`.

Метку `st:queued` ставит только панель и только после `engine:*`: на неё срабатывает диспетчер в проекте (`.github/workflows/dispatch.yml`).

## Проекты

Список в `config.json`: репозиторий и шаблоны ссылок на превью и отчёт. Новый проект добавляется записью туда и тем же набором workflows и `.agent/PROTOCOL.md` в репозитории.

## Правила

- Всё из GitHub в DOM только через `textContent` или через `md()`, которая экранирует ввод.
- Токен fine-grained, на репозитории проектов: Issues, Pull requests, Contents.
