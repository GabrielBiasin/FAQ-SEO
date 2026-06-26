-- One FAQ per question. Prevents concurrent generate_answers invocations from
-- inserting duplicate FAQs for the same question.
alter table public.faqs
  add constraint faqs_question_id_unique unique (question_id);
