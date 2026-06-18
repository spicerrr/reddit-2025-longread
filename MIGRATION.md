# Переход с Streamlit-атласа

Старая ошибка:

```text
ValueError: DataFrame index must be unique for orient='index'
```

возникала после объединения алиасов: например, `U.S` и `USA` превращались в `United States`, поэтому в таблице узлов появлялись одинаковые значения `entity`. Затем `set_index('entity').to_dict('index')` требовал уникальный индекс и останавливал приложение.

Новый фронтенд не строит pandas-индексы в браузере. Перед экспортом данные агрегируются по итоговому имени сущности:

```python
entities.groupby('entity', as_index=False).agg(...)
```

Аналитические CSV остаются прежними. `build_site_data.py` преобразует их в один компактный `data/site_data.json`, который читает статический лонгрид.

Пересборка после изменения аналитики:

```bash
python3 build_site_data.py \
  --atlas-dir /путь/до/reddit_content_atlas \
  --output .
```
