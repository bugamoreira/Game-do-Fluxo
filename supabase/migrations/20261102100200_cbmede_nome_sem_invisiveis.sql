-- =============================================================================
-- CBMEDE 2026 — Simulador do Plantão
-- Migração 6: nome de grupo sem caracteres invisíveis nem de direção de texto.
--
-- Recusa caracteres de formatação (U+200B–U+200F, U+202A–U+202E, U+2060–U+206F,
-- U+FEFF), que permitiam nomes visualmente iguais ou invertidos no telão, e
-- exige ao menos 2 letras ou dígitos. A mesma regra está no Zod do front
-- (src/shared/services/grupoService.ts).
-- =============================================================================

create or replace function interno.normalizar_nome(p_nome text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  if p_nome is null or char_length(p_nome) > 200 then
    perform interno.erro('DADOS_INVALIDOS', 'O nome do grupo precisa ter de 2 a 30 caracteres.');
  end if;
  if p_nome ~ '[​-‏‪-‮⁠-⁯﻿]' then
    perform interno.erro('DADOS_INVALIDOS', 'O nome do grupo tem caracteres invisíveis. Digite o nome de novo.');
  end if;
  v := pg_catalog.regexp_replace(pg_catalog.btrim(p_nome), '\s+', ' ', 'g');
  if char_length(v) not between 2 and 30 or v ~ '[[:cntrl:]]' then
    perform interno.erro('DADOS_INVALIDOS', 'O nome do grupo precisa ter de 2 a 30 caracteres.');
  end if;
  if char_length(pg_catalog.regexp_replace(v, '[^0-9A-Za-zÀ-ÖØ-öø-ÿ]', '', 'g')) < 2 then
    perform interno.erro('DADOS_INVALIDOS', 'O nome do grupo precisa ter ao menos 2 letras ou números.');
  end if;
  return v;
end
$$;
