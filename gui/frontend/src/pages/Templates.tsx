import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Row, Col, Card, Tag, Typography, Spin, Empty } from "antd";
import {
  RocketOutlined,
  ExperimentOutlined,
  DatabaseOutlined,
  ThunderboltOutlined,
  CodeOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { getTemplates } from "@/utils/api";
import type { TaskTemplate } from "@/types/template";

const { Title, Paragraph } = Typography;

/** Maps backend TaskCategory enum values to display metadata. */
const CATEGORY_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  training:        { label: "训练",     color: "purple",  icon: <RocketOutlined /> },
  evaluation:      { label: "评估",     color: "blue",    icon: <ExperimentOutlined /> },
  data_collection: { label: "数据采集", color: "cyan",    icon: <DatabaseOutlined /> },
  sft:             { label: "监督微调", color: "green",   icon: <CodeOutlined /> },
  inference:       { label: "推理",     color: "orange",  icon: <ThunderboltOutlined /> },
  other:           { label: "其他",     color: "default", icon: <ToolOutlined /> },
};

const getCategoryMeta = (category: string) =>
  CATEGORY_CONFIG[category] ?? { label: category, color: "default", icon: <RocketOutlined /> };

const Templates: React.FC = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getTemplates()
      .then((data) => {
        if (!cancelled) setTemplates(data);
      })
      .catch(() => {
        // API not available yet; show empty state
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <Title level={3} style={{ color: "rgba(255,255,255,0.85)" }}>
        任务模板
      </Title>
      <Paragraph style={{ color: "rgba(255,255,255,0.45)", marginBottom: 24 }}>
        选择一个模板快速创建任务
      </Paragraph>

      {loading ? (
        <div style={{ textAlign: "center", padding: 80 }}>
          <Spin size="large" />
        </div>
      ) : templates.length === 0 ? (
        <Empty
          description="暂无模板"
          style={{ marginTop: 80 }}
        />
      ) : (
        <Row gutter={[16, 16]}>
          {templates.map((tpl) => {
            const meta = getCategoryMeta(tpl.category);
            return (
              <Col xs={24} sm={12} md={8} lg={6} key={tpl.id}>
                <Card
                  hoverable
                  style={{
                    background: "#1f1f1f",
                    borderColor: "#303030",
                    height: "100%",
                  }}
                  onClick={() =>
                    navigate(`/tasks/create?template=${tpl.id}`)
                  }
                >
                  <div
                    style={{
                      fontSize: 32,
                      color: "#1668dc",
                      marginBottom: 12,
                    }}
                  >
                    {meta.icon}
                  </div>
                  <Title
                    level={5}
                    style={{
                      color: "rgba(255,255,255,0.85)",
                      marginBottom: 8,
                    }}
                  >
                    {tpl.name}
                  </Title>
                  <Tag color={meta.color} style={{ marginBottom: 8 }}>
                    {meta.label}
                  </Tag>
                  {tpl.presets.length > 0 && (
                    <Tag style={{ marginBottom: 8 }}>
                      {tpl.presets.length} 个配置
                    </Tag>
                  )}
                  <Paragraph
                    style={{
                      color: "rgba(255,255,255,0.45)",
                      fontSize: 13,
                      marginBottom: 0,
                    }}
                    ellipsis={{ rows: 2 }}
                  >
                    {tpl.description || tpl.entry_script}
                  </Paragraph>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
    </div>
  );
};

export default Templates;
