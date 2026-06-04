-- Lab QA Events / Non-Conformity table
CREATE TABLE IF NOT EXISTS lab_qa_events (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id                 UUID REFERENCES laboratories(id),
  order_id               UUID REFERENCES lab_orders(id) ON DELETE SET NULL,
  order_number           VARCHAR(50),
  accession_number       VARCHAR(50),
  patient_name           TEXT,
  patient_uhid           TEXT,

  event_type             VARCHAR(100) NOT NULL,
  stage                  VARCHAR(30)  NOT NULL DEFAULT 'PRE_ANALYTICAL'
                           CHECK (stage IN ('PRE_ANALYTICAL','ANALYTICAL','POST_ANALYTICAL')),
  severity               VARCHAR(20)  NOT NULL DEFAULT 'MINOR'
                           CHECK (severity IN ('MINOR','MAJOR','CRITICAL')),
  event_datetime         TIMESTAMPTZ,
  description            TEXT,

  action_taken           VARCHAR(100),
  root_cause             VARCHAR(100),
  corrective_action      TEXT,
  resolution_status      VARCHAR(30)  NOT NULL DEFAULT 'OPEN'
                           CHECK (resolution_status IN ('OPEN','IN_PROGRESS','RESOLVED','ESCALATED')),

  recollection_requested BOOLEAN      DEFAULT FALSE,
  doctor_notified        BOOLEAN      DEFAULT FALSE,
  tat_impacted           BOOLEAN      DEFAULT FALSE,

  reported_by            TEXT,
  reported_by_id         UUID,

  created_at             TIMESTAMPTZ  DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_qa_lab      ON lab_qa_events(lab_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_qa_severity ON lab_qa_events(severity);
CREATE INDEX IF NOT EXISTS idx_lab_qa_status   ON lab_qa_events(resolution_status);
CREATE INDEX IF NOT EXISTS idx_lab_qa_order    ON lab_qa_events(order_id);
