-- Textes éditoriaux propres au bandeau de chaque compétition.
-- Ils sont administrables et ne sont jamais écrasés par les synchronisations provider.
alter table competitions add column if not exists header_title text;
alter table competitions add column if not exists header_subtitle text;
