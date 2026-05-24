import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Steps,
  Button,
  Form,
  Input,
  Select,
  Card,
  Typography,
  Descriptions,
  message,
  Row,
  Col,
  Spin,
} from "antd";
import {
  PlusOutlined,
  MinusCircleOutlined,
} from "@ant-design/icons";
import { createTask, getTemplate } from "@/utils/api";
import type { TaskTemplate } from "@/types/template";
import type { TaskCreate as TaskCreatePayload } from "@/types/task";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const TaskCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const templateId = searchParams.get("template");

  const [current, setCurrent] = useState(0);
  const [template, setTemplate] = useState<TaskTemplate | null>(null);
  const [loading, setLoading] = useState(!!templateId);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (templateId) {
      setLoading(true);
      getTemplate(templateId)
        .then((tpl) => {
          setTemplate(tpl);
          // Pre-fill the form name from the template
          form.setFieldsValue({
            name: tpl.name,
            description: tpl.description,
          });
        })
        .catch(() => {
          message.error("无法加载模板信息");
        })
        .finally(() => setLoading(false));
    }
  }, [templateId, form]);

  const steps = [
    { title: "基本信息" },
    { title: "选择配置" },
    { title: "审核启动" },
  ];

  const handleNext = async () => {
    try {
      if (current === 0) {
        await form.validateFields(["name"]);
      }
      setCurrent((prev) => prev + 1);
    } catch {
      // Validation errors displayed by form
    }
  };

  /** Build the command string that will be executed. */
  const buildCommand = (): string => {
    if (!template) return "—";
    const configPreset = form.getFieldValue("config_preset") ?? "";
    return `bash ${template.entry_script} ${configPreset}`.trim();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const values = form.getFieldsValue(true);
      const overrides: Record<string, string> = {};
      (values.overrides ?? []).forEach(
        (item: { key: string; value: string }) => {
          if (item?.key) overrides[item.key] = item.value ?? "";
        },
      );

      const payload: TaskCreatePayload = {
        name: values.name,
        description: values.description ?? "",
        tags: values.tags ?? [],
        template_id: templateId ?? undefined,
        config_preset: values.config_preset ?? undefined,
        config_overrides: overrides,
      };

      await createTask(payload);
      message.success("任务创建成功");
      navigate("/tasks");
    } catch {
      message.error("任务创建失败，请检查后端服务是否运行");
    } finally {
      setSubmitting(false);
    }
  };

  // Derive select options from template presets
  const presetOptions = useMemo(() => {
    if (!template) return [];
    return template.presets.map((p) => ({
      label: p.name,
      value: p.id,
    }));
  }, [template]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <Title level={3} style={{ color: "rgba(255,255,255,0.85)" }}>
        创建任务
      </Title>

      <Steps
        current={current}
        items={steps}
        style={{ marginBottom: 32 }}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{ tags: [], overrides: [] }}
      >
        {/* Step 1: Basic Info */}
        <div style={{ display: current === 0 ? "block" : "none" }}>
          <Card style={{ background: "#1f1f1f", borderColor: "#303030" }}>
            <Form.Item
              label="任务名称"
              name="name"
              rules={[{ required: true, message: "请输入任务名称" }]}
            >
              <Input placeholder="例如: ppo_maniskill_training" />
            </Form.Item>

            <Form.Item label="任务描述" name="description">
              <TextArea rows={3} placeholder="可选的任务描述信息" />
            </Form.Item>

            <Form.Item label="标签" name="tags">
              <Select
                mode="tags"
                placeholder="输入后回车添加标签"
                style={{ width: "100%" }}
              />
            </Form.Item>

            {template && (
              <Paragraph style={{ color: "rgba(255,255,255,0.45)", marginBottom: 0 }}>
                模板: {template.name} ({template.entry_script})
              </Paragraph>
            )}
          </Card>
        </div>

        {/* Step 2: Config Selection */}
        <div style={{ display: current === 1 ? "block" : "none" }}>
          <Card style={{ background: "#1f1f1f", borderColor: "#303030" }}>
            <Form.Item label="配置预设" name="config_preset">
              <Select
                placeholder="选择配置预设"
                allowClear
                showSearch
                filterOption={(input, option) =>
                  (option?.label ?? "")
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
                options={presetOptions}
              />
            </Form.Item>

            {presetOptions.length === 0 && (
              <Paragraph style={{ color: "rgba(255,255,255,0.45)" }}>
                该模板没有发现配置预设，可直接跳到下一步。
              </Paragraph>
            )}

            <Title
              level={5}
              style={{
                color: "rgba(255,255,255,0.65)",
                marginTop: 16,
              }}
            >
              配置覆写
            </Title>

            <Form.List name="overrides">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <Row key={key} gutter={12} align="middle">
                      <Col flex="1">
                        <Form.Item
                          {...restField}
                          name={[name, "key"]}
                          rules={[{ required: true, message: "请输入键" }]}
                        >
                          <Input placeholder="配置键 (例如: cluster.num_nodes)" />
                        </Form.Item>
                      </Col>
                      <Col flex="1">
                        <Form.Item
                          {...restField}
                          name={[name, "value"]}
                          rules={[{ required: true, message: "请输入值" }]}
                        >
                          <Input placeholder="值" />
                        </Form.Item>
                      </Col>
                      <Col>
                        <MinusCircleOutlined
                          style={{
                            color: "rgba(255,255,255,0.45)",
                            fontSize: 18,
                            cursor: "pointer",
                            marginBottom: 24,
                          }}
                          onClick={() => remove(name)}
                        />
                      </Col>
                    </Row>
                  ))}
                  <Button
                    type="dashed"
                    onClick={() => add()}
                    block
                    icon={<PlusOutlined />}
                  >
                    添加覆写项
                  </Button>
                </>
              )}
            </Form.List>
          </Card>
        </div>

        {/* Step 3: Review */}
        <div style={{ display: current === 2 ? "block" : "none" }}>
          <Card
            title="任务摘要"
            style={{ background: "#1f1f1f", borderColor: "#303030" }}
          >
            <Descriptions column={1} colon={false}>
              <Descriptions.Item label="任务名称">
                <Text style={{ color: "rgba(255,255,255,0.85)" }}>
                  {form.getFieldValue("name") ?? "—"}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="描述">
                <Text style={{ color: "rgba(255,255,255,0.65)" }}>
                  {form.getFieldValue("description") || "—"}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="标签">
                <Text style={{ color: "rgba(255,255,255,0.65)" }}>
                  {(form.getFieldValue("tags") ?? []).join(", ") || "—"}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="模板">
                <Text style={{ color: "rgba(255,255,255,0.65)" }}>
                  {template?.name ?? templateId ?? "无"}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="配置预设">
                <Text style={{ color: "rgba(255,255,255,0.65)" }}>
                  {form.getFieldValue("config_preset") ?? "无"}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="执行命令">
                <Text
                  code
                  style={{ color: "rgba(255,255,255,0.85)" }}
                >
                  {buildCommand()}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="覆写项数">
                <Text style={{ color: "rgba(255,255,255,0.65)" }}>
                  {(form.getFieldValue("overrides") ?? []).filter(
                    (o: { key?: string }) => o?.key,
                  ).length}
                </Text>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </div>
      </Form>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginTop: 24,
          gap: 12,
        }}
      >
        {current > 0 && (
          <Button onClick={() => setCurrent((prev) => prev - 1)}>
            上一步
          </Button>
        )}
        {current < steps.length - 1 && (
          <Button type="primary" onClick={handleNext}>
            下一步
          </Button>
        )}
        {current === steps.length - 1 && (
          <Button
            type="primary"
            loading={submitting}
            onClick={handleSubmit}
          >
            创建任务
          </Button>
        )}
      </div>
    </div>
  );
};

export default TaskCreatePage;
